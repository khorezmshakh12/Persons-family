'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { createSignedWriteUrl, createSignedReadUrl, deleteObject } from '@/lib/gcp/storage';
import { logSystemAction } from '@/lib/audit-log';

export type ContractActionState = { error?: string } | undefined;

const CONTRACT_STATUSES = ['active', 'frozen', 'ended'] as const;

const contractSchema = z.object({
  staffId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  startDate: z.string().min(1),
  endDate: z.string().optional().or(z.literal('')),
  status: z.enum(CONTRACT_STATUSES).optional(),
});

export async function createContractAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = contractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      insert into staff_contracts (staff_id, title, start_date, end_date, created_by)
      values (${parsed.data.staffId}, ${parsed.data.title}, ${parsed.data.startDate}, ${parsed.data.endDate || null}, ${ceoId})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  logSystemAction('contract.create', `Created contract "${parsed.data.title}" for staff ${parsed.data.staffId}`);

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const updateContractSchema = contractSchema.extend({ id: z.string().uuid() });

/** General-purpose edit — also how the CEO reactivates a frozen contract or
 * marks one ended, not just the initial create fields. */
export async function updateContractAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateContractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  await sql`
    update staff_contracts set
      title = ${parsed.data.title},
      start_date = ${parsed.data.startDate},
      end_date = ${parsed.data.endDate || null},
      status = coalesce(${parsed.data.status ?? null}, status)
    where id = ${parsed.data.id}
  `;

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteContractAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  await sql`delete from staff_contracts where id = ${parsed.data.id}`;

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

// Duties --------------------------------------------------------------------

const dutySchema = z.object({
  staffId: z.string().uuid(),
  contractId: z.string().uuid().optional().or(z.literal('')),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function createDutyAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = dutySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      insert into staff_duties (staff_id, contract_id, title, description, created_by)
      values (${parsed.data.staffId}, ${parsed.data.contractId || null}, ${parsed.data.title}, ${parsed.data.description || null}, ${ceoId})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function deleteDutyAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  await sql`delete from staff_duties where id = ${parsed.data.id}`;

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

// Freeze / extend requests ----------------------------------------------------

const REQUEST_TYPES = ['freeze', 'extend'] as const;

const contractRequestSchema = z.object({
  contractId: z.string().uuid(),
  requestType: z.enum(REQUEST_TYPES),
  reason: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Staff-initiated only — mirrors the old contract_requests_insert_self RLS
 * check (own contract, must currently be active). Re-verified here so the
 * error message is specific instead of a generic authorization failure. */
export async function createContractRequestAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = contractRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [contract] = await sql<{ staff_id: string; status: string }[]>`
    select staff_id, status from staff_contracts where id = ${parsed.data.contractId}
  `;
  if (!contract || contract.staff_id !== user.id) return { error: 'forbidden' };
  if (contract.status !== 'active') return { error: 'contractNotActive' };

  try {
    await sql`
      insert into contract_requests (contract_id, staff_id, request_type, reason)
      values (${parsed.data.contractId}, ${user.id}, ${parsed.data.requestType}, ${parsed.data.reason || null})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  revalidatePath('/[locale]/self-development', 'page');
  return {};
}

const DECISIONS = ['approved', 'rejected'] as const;

const reviewRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(DECISIONS),
  // Only meaningful when approving an 'extend' request — the CEO sets the
  // actual new end date at approval time, not the staff member requesting it.
  newEndDate: z.string().optional().or(z.literal('')),
});

export async function reviewContractRequestAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = reviewRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [request] = await sql<{ contract_id: string; request_type: string; status: string }[]>`
    select contract_id, request_type, status from contract_requests where id = ${parsed.data.requestId}
  `;
  if (!request) return { error: 'notFound' };
  if (request.status !== 'pending') return { error: 'alreadyReviewed' };

  await sql`
    update contract_requests set status = ${parsed.data.decision}, reviewed_by = ${ceoId}, reviewed_at = now()
    where id = ${parsed.data.requestId}
  `;

  if (parsed.data.decision === 'approved') {
    if (request.request_type === 'freeze') {
      await sql`update staff_contracts set status = 'frozen' where id = ${request.contract_id}`;
    } else if (request.request_type === 'extend' && parsed.data.newEndDate) {
      await sql`update staff_contracts set end_date = ${parsed.data.newEndDate} where id = ${request.contract_id}`;
    }
  }

  revalidatePath('/[locale]/staff', 'page');
  revalidatePath('/[locale]/self-development', 'page');
  return {};
}

// Attachments -----------------------------------------------------------------
// Authorization here is entirely in requireAdmin()/the ownership checks
// below, not in bucket-level policy — there is no RLS-equivalent layer for
// Cloud Storage, so the Server Action boundary is the real (and only)
// authorization boundary, same as it effectively was before.

export type ContractUploadUrlResult = { path?: string; url?: string; error?: string };

export async function requestContractFileUploadUrlAction(
  contractId: string,
  fileName: string,
  fileType: string,
): Promise<ContractUploadUrlResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const sanitized = fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${contractId}/${crypto.randomUUID()}-${sanitized}`;

  try {
    const url = await createSignedWriteUrl('contract-files', path, fileType || 'application/octet-stream');
    return { path, url };
  } catch {
    return { error: 'uploadFailed' };
  }
}

const attachSchema = z.object({
  contractId: z.string().uuid(),
  path: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().optional().or(z.literal('')),
});

export async function attachContractFileAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      insert into contract_attachments (contract_id, file_url, file_name, file_type, uploaded_by)
      values (${parsed.data.contractId}, ${parsed.data.path}, ${parsed.data.fileName}, ${parsed.data.fileType || null}, ${ceoId})
    `;
  } catch {
    return { error: 'uploadFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function deleteContractAttachmentAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [attachment] = await sql<{ file_url: string }[]>`
    select file_url from contract_attachments where id = ${parsed.data.id}
  `;
  if (!attachment) return { error: 'notFound' };

  await sql`delete from contract_attachments where id = ${parsed.data.id}`;

  // Best-effort storage cleanup after the row is gone — the DB row is the
  // source of truth for access control, so a failed object delete shouldn't
  // block removing the reference to it (mirrors deleteTaskAction-style
  // ordering: the authoritative record goes first).
  await deleteObject('contract-files', attachment.file_url).catch(() => {});

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const CONTRACT_FILE_READ_URL_EXPIRY_SECONDS = 60 * 60;

export type ContractReadUrlResult = { signedUrl?: string; error?: string };

/** Signs a contract attachment for reading — the CEO can read any
 * attachment, a staff member only one on their own contract, re-checked
 * here since (per the note above) there's no bucket-policy layer to rely
 * on. */
export async function requestContractFileReadUrlAction(
  attachmentId: string,
): Promise<ContractReadUrlResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const [attachment] = await sql<{ file_url: string; contract_id: string }[]>`
    select file_url, contract_id from contract_attachments where id = ${attachmentId}
  `;
  if (!attachment) return { error: 'notFound' };

  if (profile.role !== 'ceo') {
    const [contract] = await sql<{ staff_id: string }[]>`
      select staff_id from staff_contracts where id = ${attachment.contract_id}
    `;
    if (!contract || contract.staff_id !== user.id) return { error: 'forbidden' };
  }

  try {
    const signedUrl = await createSignedReadUrl('contract-files', attachment.file_url, CONTRACT_FILE_READ_URL_EXPIRY_SECONDS);
    return { signedUrl };
  } catch {
    return { error: 'downloadFailed' };
  }
}

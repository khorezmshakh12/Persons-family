'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = contractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_contracts').insert({
    staff_id: parsed.data.staffId,
    title: parsed.data.title,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate || null,
    created_by: ceoId,
  });
  if (error) return { error: 'createFailed' };

  logSystemAction(
    supabase,
    'contract.create',
    `Created contract "${parsed.data.title}" for staff ${parsed.data.staffId}`,
  );

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateContractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('staff_contracts')
    .update({
      title: parsed.data.title,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate || null,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_contracts').delete().eq('id', parsed.data.id);
  if (error) return { error: 'deleteFailed' };

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = dutySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_duties').insert({
    staff_id: parsed.data.staffId,
    contract_id: parsed.data.contractId || null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    created_by: ceoId,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function deleteDutyAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_duties').delete().eq('id', parsed.data.id);
  if (error) return { error: 'deleteFailed' };

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

/** Staff-initiated only — mirrors contract_requests_insert_self's RLS check
 * (own contract, must currently be active). That check is re-verified here
 * so the error message is specific instead of a generic RLS failure. */
export async function createContractRequestAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = contractRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from('staff_contracts')
    .select('staff_id, status')
    .eq('id', parsed.data.contractId)
    .maybeSingle();
  if (!contract || contract.staff_id !== user.id) return { error: 'forbidden' };
  if (contract.status !== 'active') return { error: 'contractNotActive' };

  const { error } = await supabase.from('contract_requests').insert({
    contract_id: parsed.data.contractId,
    staff_id: user.id,
    request_type: parsed.data.requestType,
    reason: parsed.data.reason || null,
  });
  if (error) return { error: 'createFailed' };

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = reviewRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from('contract_requests')
    .select('contract_id, request_type, status')
    .eq('id', parsed.data.requestId)
    .maybeSingle();
  if (!request) return { error: 'notFound' };
  if (request.status !== 'pending') return { error: 'alreadyReviewed' };

  const { error: reviewError } = await supabase
    .from('contract_requests')
    .update({
      status: parsed.data.decision,
      reviewed_by: ceoId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.requestId);
  if (reviewError) return { error: 'updateFailed' };

  if (parsed.data.decision === 'approved') {
    if (request.request_type === 'freeze') {
      await supabase
        .from('staff_contracts')
        .update({ status: 'frozen' })
        .eq('id', request.contract_id);
    } else if (request.request_type === 'extend' && parsed.data.newEndDate) {
      await supabase
        .from('staff_contracts')
        .update({ end_date: parsed.data.newEndDate })
        .eq('id', request.contract_id);
    }
  }

  revalidatePath('/[locale]/staff', 'page');
  revalidatePath('/[locale]/self-development', 'page');
  return {};
}

// Attachments -----------------------------------------------------------------
// Goes through the admin (service-role) client, same as every upload path in
// this app except avatars — see the note in
// 20260713090000_restore_storage_write_policies.sql: storage.objects
// INSERT/UPDATE/DELETE RLS policies don't reliably survive this project's
// infra, so requireAdmin()/the ownership check here (not the policies defined
// alongside the bucket) is the actual authorization boundary.

export type ContractUploadUrlResult = { path?: string; token?: string; error?: string };

export async function requestContractFileUploadUrlAction(
  contractId: string,
  fileName: string,
): Promise<ContractUploadUrlResult> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const sanitized = fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${contractId}/${crypto.randomUUID()}-${sanitized}`;

  const { data, error } = await createAdminClient()
    .storage.from('contract-files')
    .createSignedUploadUrl(path);
  if (error || !data) return { error: 'uploadFailed' };

  return { path, token: data.token };
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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('contract_attachments').insert({
    contract_id: parsed.data.contractId,
    file_url: parsed.data.path,
    file_name: parsed.data.fileName,
    file_type: parsed.data.fileType || null,
    uploaded_by: ceoId,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function deleteContractAttachmentAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from('contract_attachments')
    .select('file_url')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!attachment) return { error: 'notFound' };

  const { error } = await supabase.from('contract_attachments').delete().eq('id', parsed.data.id);
  if (error) return { error: 'deleteFailed' };

  // Best-effort storage cleanup after the row is gone — the DB row is the
  // source of truth for access control, so a failed object delete shouldn't
  // block removing the reference to it (mirrors deleteTaskAction-style
  // ordering: the authoritative record goes first).
  await createAdminClient().storage.from('contract-files').remove([attachment.file_url]);

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const CONTRACT_FILE_READ_URL_EXPIRY_SECONDS = 60 * 60;

export type ContractReadUrlResult = { signedUrl?: string; error?: string };

/** Signs a contract attachment for reading — the CEO can read any
 * attachment, a staff member only one on their own contract, re-checked
 * here since (per the note above) the actual storage RLS read policy isn't
 * a dependable boundary on this project. */
export async function requestContractFileReadUrlAction(
  attachmentId: string,
): Promise<ContractReadUrlResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from('contract_attachments')
    .select('file_url, contract_id')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!attachment) return { error: 'notFound' };

  if (profile.role !== 'ceo' && profile.role !== 'it_developer') {
    const { data: contract } = await supabase
      .from('staff_contracts')
      .select('staff_id')
      .eq('id', attachment.contract_id)
      .maybeSingle();
    if (!contract || contract.staff_id !== user.id) return { error: 'forbidden' };
  }

  const { data, error } = await createAdminClient()
    .storage.from('contract-files')
    .createSignedUrl(attachment.file_url, CONTRACT_FILE_READ_URL_EXPIRY_SECONDS);
  if (error || !data) return { error: 'downloadFailed' };

  return { signedUrl: data.signedUrl };
}

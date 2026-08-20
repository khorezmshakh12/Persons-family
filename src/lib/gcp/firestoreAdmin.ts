import 'server-only';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from './credentials';

const db = () => getFirestore(getFirebaseAdminApp());

/** Sorted-pair id, matching dm_conversations' convention in Cloud SQL. */
export function conversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join('_');
}

/**
 * Bumps a "something changed" signal doc — the client listens via
 * onSnapshot and re-fetches the real data through its own Server Action
 * (which re-applies full authorization) rather than trusting anything read
 * from Firestore itself. Call this from every Server Action that mutates
 * the underlying table.
 */
export async function bumpSignal(path: string): Promise<void> {
  await db().doc(path).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export function bumpBoardSignal(board: 'tasks' | 'issues'): Promise<void> {
  return bumpSignal(`board_signals/${board}`);
}

export function bumpNavBadgeSignal(uid: string): Promise<void> {
  return bumpSignal(`nav_badge_signals/${uid}`);
}

export function bumpAnnouncementsSignal(): Promise<void> {
  return bumpSignal('announcements_signal/current');
}

/**
 * Mirrors a chat message into Firestore right after it's committed to
 * Cloud SQL, for instant delivery — Cloud SQL stays the source of truth
 * (history, search, moderation), Firestore only exists so the recipient's
 * open tab sees it without polling. Creates/refreshes the parent
 * conversation doc's `participants` array (read by firestore.rules) on
 * every send, since it's cheap and self-healing if a doc is ever missing.
 */
export async function mirrorChatMessage(params: {
  senderId: string;
  receiverId: string;
  messageId: string;
  messageText: string | null;
  mediaUrl: string | null;
  mediaType: string;
  createdAt: string;
}): Promise<void> {
  const id = conversationId(params.senderId, params.receiverId);
  const convoRef = db().doc(`chats/${id}`);
  const messageRef = convoRef.collection('messages').doc(params.messageId);

  await db().runTransaction(async (tx) => {
    tx.set(
      convoRef,
      { participants: [params.senderId, params.receiverId], updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(messageRef, {
      senderId: params.senderId,
      receiverId: params.receiverId,
      messageText: params.messageText,
      mediaUrl: params.mediaUrl,
      mediaType: params.mediaType,
      createdAt: params.createdAt,
      isRead: false,
    });
  });
}

/** Removes a DM message's Firestore mirror after it's deleted from Cloud
 * SQL, so an open recipient tab drops it live instead of it lingering
 * until their next full resync. */
export async function deleteChatMessageMirror(senderId: string, receiverId: string, messageId: string): Promise<void> {
  const id = conversationId(senderId, receiverId);
  await db().doc(`chats/${id}`).collection('messages').doc(messageId).delete();
}

/** Flips isRead on every mirrored message from otherUserId to userId, so
 * the sender's tab sees the read-receipt tick live — called from
 * markConversationRead() right after the same flip lands in Cloud SQL. */
export async function markChatMirrorRead(userId: string, otherUserId: string): Promise<void> {
  const id = conversationId(userId, otherUserId);
  const unread = await db()
    .doc(`chats/${id}`)
    .collection('messages')
    .where('receiverId', '==', userId)
    .where('senderId', '==', otherUserId)
    .where('isRead', '==', false)
    .get();
  if (unread.empty) return;
  const batch = db().batch();
  unread.docs.forEach((snap) => batch.update(snap.ref, { isRead: true }));
  await batch.commit();
}

/**
 * Keeps group_chat_meta/{groupId}'s membership in sync — the group's
 * teacher + assigned TA, the only two people staff-chat.ts's 2-person
 * group chat is for. Call this from groups.ts whenever a group is
 * created/deleted or its teacher_id/assigned_ta_id changes. Firestore
 * rules can't query Cloud SQL, so this doc is what group_chats/{groupId}'s
 * read rule checks membership against.
 */
export async function syncGroupChatMembers(
  groupId: string,
  teacherId: string | null,
  assignedTaId: string | null,
): Promise<void> {
  const members = [teacherId, assignedTaId].filter((id): id is string => Boolean(id));
  await db().doc(`group_chat_meta/${groupId}`).set({ members }, { merge: false });
}

export async function deleteGroupChatMeta(groupId: string): Promise<void> {
  await db().doc(`group_chat_meta/${groupId}`).delete();
}

/** Mirrors a group (teacher/TA) chat message into Firestore for instant
 * delivery, same reasoning as mirrorChatMessage() above. conversationId
 * here is the group's own id. */
export async function mirrorGroupChatMessage(params: {
  groupId: string;
  messageId: string;
  senderId: string;
  content: string;
  createdAt: string;
}): Promise<void> {
  await db()
    .doc(`group_chats/${params.groupId}`)
    .collection('messages')
    .doc(params.messageId)
    .set({
      senderId: params.senderId,
      content: params.content,
      createdAt: params.createdAt,
    });
}

/** Removes a group chat message's Firestore mirror after it's deleted from
 * Cloud SQL — same reasoning as deleteChatMessageMirror() above. */
export async function deleteGroupChatMessageMirror(groupId: string, messageId: string): Promise<void> {
  await db().doc(`group_chats/${groupId}`).collection('messages').doc(messageId).delete();
}

// Resolves a conversation's *active* message thread.
//
// claude.ai stores conversations as a tree: editing a prompt or regenerating a
// reply forks a new branch, and every branch stays in chat_messages. Only the
// chain reachable from current_leaf_message_uuid is the conversation you see in
// the UI, so we walk parent links up from the leaf rather than trusting array
// order.

export function buildThread(conversation) {
  const messages = conversation?.chat_messages ?? [];
  const byUuid = new Map(messages.map((m) => [m.uuid, m]));

  const chain = [];
  const seen = new Set();
  let cur = conversation?.current_leaf_message_uuid;
  while (byUuid.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const message = byUuid.get(cur);
    chain.push(message);
    cur = message.parent_message_uuid;
  }
  chain.reverse();

  // Conversations fetched without a usable leaf (older exports, partial
  // responses) still export in the order the API returned them.
  const ordered = chain.length ? chain : messages;

  return ordered
    .map((m) => ({
      uuid: m.uuid,
      role: m.sender === 'human' ? 'human' : 'assistant',
      createdAt: m.created_at,
      text: messageText(m),
    }))
    .filter((m) => m.text !== '');
}

// Only `text` blocks are prose. `thinking`, `tool_use` and `tool_result` blocks
// are deliberately dropped: the export is a readable transcript, and the raw
// JSON export keeps everything for anyone who wants it back.
function messageText(message) {
  return (message.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

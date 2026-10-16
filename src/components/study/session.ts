export type Session<T extends { id: string }> = { queue: T[]; total: number; completed: number };
export function startSession<T extends { id: string }>(cards: T[]): Session<T> {
  const queue = [...new Map(cards.map(card => [card.id, card])).values()];
  return { queue, total: queue.length, completed: 0 };
}
export function completeCard<T extends { id: string }>(session: Session<T>, id: string): Session<T> {
  if (!session.queue.some(card => card.id === id)) return session;
  return { ...session, queue: session.queue.filter(card => card.id !== id), completed: session.completed + 1 };
}

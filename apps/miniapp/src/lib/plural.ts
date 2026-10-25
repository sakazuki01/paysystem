/** "1 time" / "6 times". English regular plurals only; that's all the copy needs. */
export const plural = (n: number, noun: string) => `${n} ${n === 1 ? noun : `${noun}s`}`;

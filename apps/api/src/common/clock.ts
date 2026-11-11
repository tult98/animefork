export type Clock = () => Date;

export const CLOCK = Symbol('Clock');

export const systemClock: Clock = () => new Date();

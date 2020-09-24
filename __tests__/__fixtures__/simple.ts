export const bar = 'a string';
export const foo: number = 1;

export interface Interface {
  one: boolean;
  two: number;
}

export type Type = number & Interface;

/** 
 * Add two numbers
 * 
 * @param left - the first number
 * @param right - the second number
 * 
 * @example
 * add(1, 2)
 */
export function add(left: number, right: number): string {
  return '';
}


/** 
 * Subtract two numbers
 */
export function subtract(left: number, right): string {
  return '';
}

/** 
 * @param foo - the callback
 */
export function withCallback(foo: (value: string) => string ): string {
  return '';
}


/** 
 * A car
 * 
 * @property wheels - A circle thing
 */
export class Car {
  wheels: number
}
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/* eslint-disable @typescript-eslint/no-empty-object-type -- declaration merging is Vitest's matcher-extension contract */
declare module '@vitest/expect' {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}

/**
 * Use the declarations matching the vendored Three.js r128 runtime.
 * This sidecar keeps TypeScript from inferring types from the 46k-line vendor
 * implementation while preserving the browser's existing relative import.
 */
export * from "three";

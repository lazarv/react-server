/**
 * This function is used to tell the server that the component should be postponed and prerender should be used for the rendering context.
 *
 * @param reason - The reason for using prerender
 */
export function usePrerender(reason?: string): void;

/**
 * This function is used to wrap a component and tell the server that the component should be postponed and prerender should be used for the rendering context.
 *
 * @param Component - The component to be postponed
 */
export function withPrerender<T extends React.FC>(Component: T): T;

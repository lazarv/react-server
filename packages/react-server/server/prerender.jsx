import { usePostpone as _usePostpone } from "./postpone.mjs";

export const usePostpone = _usePostpone;
export const usePrerender = _usePostpone;

export function withPrerender(Component) {
  return function WithPrerender(props) {
    usePrerender();
    return <Component {...props} />;
  };
}

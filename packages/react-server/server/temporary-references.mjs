export function remoteTemporaryReferences(obj) {
  function makeTransitional(path) {
    return {
      $$typeof: Symbol.for("react.transitional.element"),
      type: Symbol.for("react.fragment"),
      key: null,
      props: { children: [path ? `$T0:${path}` : `$T0`] },
      _owner: null,
      _store: null,
    };
  }

  if (obj === "$T") {
    return makeTransitional();
  }

  let rootOut;
  if (Array.isArray(obj)) {
    rootOut = [];
  } else if (typeof obj === "object" && obj !== null) {
    rootOut = {};
  } else {
    return obj;
  }

  const stack = [{ orig: obj, out: rootOut, path: "" }];
  while (stack.length) {
    const { orig, out, path } = stack.pop();

    if (Array.isArray(orig)) {
      for (let i = 0; i < orig.length; i++) {
        const val = orig[i];
        const nextPath = path ? `${path}:${i}` : `${i}`;

        if (val === "$T") {
          out[i] = makeTransitional(nextPath);
        } else if (Array.isArray(val)) {
          const newArr = [];
          out[i] = newArr;
          stack.push({ orig: val, out: newArr, path: nextPath });
        } else if (val !== null && typeof val === "object") {
          const newObj = {};
          out[i] = newObj;
          stack.push({ orig: val, out: newObj, path: nextPath });
        } else {
          out[i] = val;
        }
      }
    } else {
      for (const key of Object.keys(orig)) {
        const val = orig[key];
        const nextPath = path ? `${path}:${key}` : key;

        if (val === "$T") {
          out[key] = makeTransitional(nextPath);
        } else if (Array.isArray(val)) {
          const newArr = [];
          out[key] = newArr;
          stack.push({ orig: val, out: newArr, path: nextPath });
        } else if (val !== null && typeof val === "object") {
          const newObj = {};
          out[key] = newObj;
          stack.push({ orig: val, out: newObj, path: nextPath });
        } else {
          out[key] = val;
        }
      }
    }
  }

  return rootOut;
}

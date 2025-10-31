# README

This is a demo of `shadcn` and `tailwindcss 4.1` with the featured [dashboard block](https://ui.shadcn.com/blocks).

## FIXES

see [FIXED.md](FIXES.md)

## STATUS

**DEV:** working - when used with fixes
**PROD:** broken - see open bugs

## OPEN BUGS

### Browser: `import_react is not defined``

`pnpm build && pnpm start`

```
hook.js:608 ReferenceError: import_react is not defined
    at A (chart-area-interactive.D122DI0M.mjs:1:5673)
    at ys (react.W4hQKLIk.mjs:8:50098)
    at ml (react.W4hQKLIk.mjs:8:73420)
    at Ml (react.W4hQKLIk.mjs:8:83928)
    at Df (react.W4hQKLIk.mjs:8:133480)
    at wf (react.W4hQKLIk.mjs:8:132561)
    at Cf (react.W4hQKLIk.mjs:8:132399)
    at uf (react.W4hQKLIk.mjs:8:128958)
    at cp (react.W4hQKLIk.mjs:8:145195)
    at MessagePort.T (react.W4hQKLIk.mjs:1:10199)
overrideMethod @ hook.js:608
Gc @ react.W4hQKLIk.mjs:8
Jc @ react.W4hQKLIk.mjs:8
Zc.o.componentDidCatch.e.callback @ react.W4hQKLIk.mjs:8
Wo @ react.W4hQKLIk.mjs:8
Go @ react.W4hQKLIk.mjs:8
Ul @ react.W4hQKLIk.mjs:8
Pu @ react.W4hQKLIk.mjs:8
Xu @ react.W4hQKLIk.mjs:8
Pu @ react.W4hQKLIk.mjs:8
Xu @ react.W4hQKLIk.mjs:8
Pu @ react.W4hQKLIk.mjs:8
Xu @ react.W4hQKLIk.mjs:8
Pu @ react.W4hQKLIk.mjs:8
Xu @ react.W4hQKLIk.mjs:8
Pu @ react.W4hQKLIk.mjs:8
Xu @ react.W4hQKLIk.mjs:8
Pu @ react.W4hQKLIk.mjs:8
If @ react.W4hQKLIk.mjs:8
Mf @ react.W4hQKLIk.mjs:8
df @ react.W4hQKLIk.mjs:8
uf @ react.W4hQKLIk.mjs:8
cp @ react.W4hQKLIk.mjs:8
T @ react.W4hQKLIk.mjs:1
```

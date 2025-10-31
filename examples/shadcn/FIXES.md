# FIXES

patches to get it working:

## OXC transformation error

```
Pre-transform error: Expected a semicolon or an implicit semicolon after a statement, but found none
4:28:39 PM [react-server] (client)   Plugin: vite:oxc
4:28:39 PM [react-server] (client)   File: /react-server/examples/shadcn/src/hooks/use-mobile.ts:6:59
4:28:39 PM [react-server] (client)   2  |  const MOBILE_BREAKPOINT = 768;
4:28:39 PM [react-server] (client)   3  |  export function useIsMobile() {
4:28:39 PM [react-server] (client)   4  |    const [isMobile, setIsMobile] = React.useState < boolean | undefined > undefined;
4:28:39 PM [react-server] (client)      |                                                                          ^
4:28:39 PM [react-server] (client)   5  |    React.useEffect(() => {
4:28:39 PM [react-server] (client)   6  |      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
4:28:39 PM [react-server] (client)   Try insert a semicolon here
```
[`use-mobile.ts`](src/hooks/use-mobile.ts) - fix error `vite:oxc Expected a semicolon or an implicit semicolon after a statement`

OLD:
```ts
const [isMobile, setIsMobile] = React.useState<boolean|undefined>(undefined)
```

NEW:
```ts
type IsMobileState = boolean | undefined
const [isMobile, setIsMobile] = React.useState<IsMobileState>(undefined)
```

was not able to replicate with [Oxc playground](https://playground.oxc.rs/#eNqdVN9P2zAQ/lc8aw9lKmjbw4YqQOJHK1VraQdoPBA0nOTSGhw72Je2qOv/vnMSp0XwMO0hin3nu+/uu89e84T3uMwLY5F9YsKxKxAJssyanEXc+k3EIx3pxGiHbDw5G476v8+u+qc/ppPh5Q07Zt+/HfoDsKqSZKVOUBrNSgdDNzaxVNDZY+tIM+a/Os+dbFxd5gDDuXvKVuEfUPA1CoSj2BgFQv8pdQqZ1JCedNrlnodl24h+lkGCHUI7PqkBA1z+rCj1UurULA9ygcl8DKkUnYdOLlb7S5nivMc+rt92t8++bIrV3gNBbbMZfT4XegaU8hUW2+2l06BJrcHeegR29Ja+Ju+m/lGZByJN+wvQOJIOgUI7EU8qtIh3W+Qm7H/hLGBpdVO8B7WQmwX8I+6my+7uG+6bTB8+hHlGmnrhXW54b81tqf1PSY28h7aELs+MJf4RLO9lQjmyoBXaeXM4Ip1RNPr0AhIlrPBicu3p5VwiuEIk0Jpyqkxtt4nJCwtuG+ISU5C7Tu5e8tiosEuyWXNs0+WFsM7XteawIgoc4dLdQEfdCKXM8qrqdVKikykMGpmHTB4S7AKmwlJosFZxvw6HGq2khEnrcEBVo0z61hrbWKkEz1RVAq13mFpzUveNiLc9oYirIfPe1y4HnU6yEd0IKldlVG5BaNj4Dz8TmvQM/SwNbml6dKvrd8zPfje1piAsLty+BkghpZw0Jknlzc5NngvvU4qs1Idsm6VelqF/8i/Fi+cutiJ5ArymmVF4OBysIoe68gbfxI90h2+tKChHINUDVbWeIhEZl1Qh2Fdh9PiAlTnpV6gJLQUaOzVO1iPyDHGitJVaTSoKOwNSJgdHrxcSCtF8Ub0tA2PPlXBuIEGl7dR2UUidpoLZenOJrXUMKFKBxFQz2vdVveaOOipIIGC1IF0GMSYmhRlU10d7IbSSfXSpoTe7oVxrQ8/kjg4VzMLZKku4C15R4aJQ56YYwQLapE8AxSWNIgisCiXRGjUgAfuIBdjYuEC470f7QXlXu9qQuX6avbldbbzd0xx62vwFxIFBXg==)

## sidebar context

`src/app/dashboard/page.tsx`- add `"use client";` to fix sidebar context
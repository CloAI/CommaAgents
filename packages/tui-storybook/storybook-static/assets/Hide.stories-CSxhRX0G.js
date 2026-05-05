import{j as r}from"./jsx-runtime-BjG_zV1W.js";import{B as p,T as l}from"./parse-keypress-DxfFivvL.js";import{r as s}from"./index-C-D8K_XC.js";import{u as g}from"./use-stdout-BKjaryTg.js";import{u as v}from"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";const B=["xs","sm","md","lg","xl"];function k(e,n){let i="xs";for(const o of B)e>=n[o]&&(i=o);return i}function A(){const{stdout:e}=g(),{breakpoints:n,containerWidths:i}=v(),[o,a]=s.useState(()=>e?.columns??process.stdout.columns),[h,H]=s.useState(()=>e?.rows??process.stdout.rows);s.useEffect(()=>{if(!e)return;const t=()=>{a(e.columns),H(e.rows)};return e.on("resize",t),()=>{e.off("resize",t)}},[e]);const d=s.useMemo(()=>k(o,n),[o,n]),b=s.useMemo(()=>i[d],[i,d]),w=s.useCallback(t=>o>=n[t],[o,n]),f=s.useCallback(t=>o<n[t],[o,n]),y=s.useCallback((t,j)=>o>=n[t]&&o<n[j],[o,n]);return s.useMemo(()=>({columns:o,rows:h,breakpoint:d,containerWidth:b,above:w,below:f,between:y}),[o,h,d,b,w,f,y])}function T(e,n){return typeof e=="number"?e:n[e]}function c({below:e,above:n,children:i}){const{columns:o}=A(),{breakpoints:a}=v();return e!==void 0&&o<T(e,a)||n!==void 0&&o>=T(n,a)?null:i}const L={title:"Components/Hide",component:c,parameters:{docs:{description:{component:'`Hide` conditionally renders children based on the active terminal width.\nUse `below` / `above` with either a named breakpoint (`"sm"`, `"md"`, ...)\nor a raw column count.\n\nThe Storybook preview emulates an 80-column terminal by default; resize\nthe addon viewport (or change the `xterm` parameter) to see thresholds\ntrigger.'}}}},m={render:()=>r.jsxs(p,{flexDirection:"column",children:[r.jsx(l,{children:"Always visible."}),r.jsx(c,{below:"md",children:r.jsx(l,{color:"cyan",children:"Visible only on md+ terminals."})})]})},u={render:()=>r.jsxs(p,{flexDirection:"column",children:[r.jsx(l,{children:"Always visible."}),r.jsx(c,{above:120,children:r.jsx(l,{color:"yellow",children:"Hidden when terminal is wider than 120 cols."})})]})},x={render:()=>r.jsxs(p,{flexDirection:"column",gap:1,children:[r.jsx(c,{below:"lg",children:r.jsx(l,{color:"green",children:"Wide-only header (lg+)"})}),r.jsx(c,{below:"md",children:r.jsx(l,{color:"cyan",children:"Medium-and-up content"})}),r.jsx(l,{children:"Always visible footer"})]})};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="column">
      <Text>Always visible.</Text>
      <Hide below="md">
        <Text color="cyan">Visible only on md+ terminals.</Text>
      </Hide>
    </Box>
}`,...m.parameters?.docs?.source}}};u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="column">
      <Text>Always visible.</Text>
      <Hide above={120}>
        <Text color="yellow">Hidden when terminal is wider than 120 cols.</Text>
      </Hide>
    </Box>
}`,...u.parameters?.docs?.source}}};x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="column" gap={1}>
      <Hide below="lg">
        <Text color="green">Wide-only header (lg+)</Text>
      </Hide>
      <Hide below="md">
        <Text color="cyan">Medium-and-up content</Text>
      </Hide>
      <Text>Always visible footer</Text>
    </Box>
}`,...x.parameters?.docs?.source}}};const V=["HideBelowMedium","HideAboveColumns","ResponsiveLayout"];export{u as HideAboveColumns,m as HideBelowMedium,x as ResponsiveLayout,V as __namedExportsOrder,L as default};

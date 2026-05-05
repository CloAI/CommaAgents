import{j as t}from"./jsx-runtime-BjG_zV1W.js";import{r as g}from"./index-C-D8K_XC.js";import{B as f,T as m}from"./parse-keypress-DxfFivvL.js";import{u as j}from"./use-input-Dlgi9-AW.js";import{u as C}from"./use-focus-DyHGIeWN.js";import{u as w}from"./useDebugRender-opVd3fBA.js";import{u as y}from"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import{a as E}from"./useMouse.utils-Bg5NRmlo.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-stdout-BKjaryTg.js";function b(){const r=y();return g.useMemo(()=>({inputBorder:{borderStyle:"round",borderColor:r.colors.primary,paddingX:r.spacing.xs,width:"100%"},prompt:{color:r.colors.primary,bold:r.typography.labelBold},query:{color:r.colors.primary},placeholder:{color:r.colors.muted,dimColor:r.typography.secondaryDim}}),[r])}const A=typeof process.stdin.setRawMode=="function";function S(r){const{value:e,onChange:s,placeholder:d="Search...",prompt:u="› ",id:h}=r,x=w("SearchInput",{props:{value:e,id:h}}),I=b(),{isFocused:v}=C({id:h,isActive:A});return j((a,o)=>{if(o.backspace||o.delete){s(e.slice(0,-1));return}o.upArrow||o.downArrow||o.leftArrow||o.rightArrow||o.return||o.escape||o.tab||a&&E(a)||a&&!o.ctrl&&!o.meta&&s(e+a)},{isActive:v}),t.jsx(f,{ref:x.ref,width:"100%",flexShrink:0,children:t.jsx(R,{theme:I,value:e,placeholder:d,prompt:u})})}function R(r){const{theme:e,value:s,placeholder:d,prompt:u}=r;return t.jsxs(f,{...e.inputBorder,children:[t.jsx(m,{...e.prompt,children:u}),s.length===0?t.jsx(m,{...e.placeholder,children:d}):t.jsx(m,{...e.query,children:s})]})}const z={title:"Components/SearchInput",component:S,args:{value:"",placeholder:"Search strategies...",prompt:"› "},argTypes:{placeholder:{control:"text"},prompt:{control:"text"}},parameters:{docs:{description:{component:"`SearchInput` is a controlled single-line search field with a prompt\ncaret and placeholder. It deliberately ignores arrow keys, Enter, and\nEscape so the parent can own list navigation and dismissal."}}}};function i(r){const[e,s]=g.useState(r.value);return t.jsx(S,{...r,value:e,onChange:s})}const n={render:r=>t.jsx(i,{...r})},c={args:{value:"research"},render:r=>t.jsx(i,{...r})},p={args:{value:"",placeholder:"Search...",prompt:"🔍 "},render:r=>t.jsx(i,{...r})},l={args:{id:"strategy-search",value:"agent",placeholder:"Search strategies..."},render:r=>t.jsx(i,{...r})};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: args => <ControlledSearchInput {...args} />
}`,...n.parameters?.docs?.source}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    value: "research"
  },
  render: args => <ControlledSearchInput {...args} />
}`,...c.parameters?.docs?.source}}};p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    value: "",
    placeholder: "Search...",
    prompt: "🔍 "
  },
  render: args => <ControlledSearchInput {...args} />
}`,...p.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    id: "strategy-search",
    value: "agent",
    placeholder: "Search strategies..."
  },
  render: args => <ControlledSearchInput {...args} />
}`,...l.parameters?.docs?.source}}};const G=["Empty","WithQuery","CustomPrompt","WithFocusId"];export{p as CustomPrompt,n as Empty,l as WithFocusId,c as WithQuery,G as __namedExportsOrder,z as default};

import{j as a}from"./jsx-runtime-BjG_zV1W.js";import{B as m,T as c}from"./parse-keypress-DxfFivvL.js";import"./index-C-D8K_XC.js";import{B as p}from"./BorderedPanel-Q96qOL9j.js";import"./useTheme.context-BL1VLgZE.js";import{u as d}from"./MessageList.theme-SDjce97R.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./defineTheme-DdZGqrht.js";import"./useTheme-Cgx5yjbn.js";function l({text:n}){const i=d();return a.jsx(g,{theme:i,text:n})}function g({theme:n,text:i}){const e=n.systemMessage;return a.jsx(m,{flexDirection:"column",marginBottom:e.container.marginBottom,children:a.jsx(p,{header:"system",borderColor:e.borderColor,headerColor:e.text.color,children:a.jsx(c,{...e.text,children:i})})})}const N={title:"Components/MessageList/SystemMessage",component:l,args:{text:"Strategy 'refactor-tui' started (run_id=run_8c2f)."},argTypes:{text:{control:"text"}},parameters:{docs:{description:{component:'`SystemMessage` renders strategy lifecycle events, step transitions, and\nsurfaced errors inside a bordered panel with a fixed `"system"` header.'}}}},t={},r={args:{text:"Step 'plan' completed in 1.2s."}},s={args:{text:"Error: failed to load strategy at /strategies/missing.ts (ENOENT)."}},o={args:{text:`Strategy completed.
  steps: 4
  duration: 18.7s
  result: success`}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:"{}",...t.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    text: "Step 'plan' completed in 1.2s."
  }
}`,...r.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    text: "Error: failed to load strategy at /strategies/missing.ts (ENOENT)."
  }
}`,...s.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    text: "Strategy completed.\\n  steps: 4\\n  duration: 18.7s\\n  result: success"
  }
}`,...o.parameters?.docs?.source}}};const _=["StrategyStarted","StepCompleted","Error","Multiline"];export{s as Error,o as Multiline,r as StepCompleted,t as StrategyStarted,_ as __namedExportsOrder,N as default};

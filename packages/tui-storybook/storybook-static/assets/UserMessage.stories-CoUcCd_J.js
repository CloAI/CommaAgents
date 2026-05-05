import{U as o}from"./UserMessage-B5f3FcJN.js";import"./jsx-runtime-BjG_zV1W.js";import"./parse-keypress-DxfFivvL.js";import"./_commonjsHelpers-BosuxZz1.js";import"./index-C-D8K_XC.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./BorderedPanel-Q96qOL9j.js";import"./defineTheme-DdZGqrht.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./MessageList.theme-SDjce97R.js";const x={title:"Components/MessageList/UserMessage",component:o,args:{text:"Refactor MessageList so each segment kind has its own renderer."},argTypes:{text:{control:"text"},label:{control:"text"}},parameters:{docs:{description:{component:'`UserMessage` renders a single user-typed message inside a bordered\npanel. The header label defaults to "you" and is configurable via\n`label`.'}}}},e={},t={args:{text:"yes"}},s={args:{text:"Could you please walk me through the data flow from the daemon WebSocket message all the way to the rendered AgentMessage segment, including the buffering and flush logic in between? I'd like to understand the failure modes when the daemon disconnects mid-stream."}},r={args:{label:"alice",text:"Reviewing the diff now."}},a={args:{text:`Here is what I want:
- step one
- step two
- step three

Thanks!`}};e.parameters={...e.parameters,docs:{...e.parameters?.docs,source:{originalSource:"{}",...e.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    text: "yes"
  }
}`,...t.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    text: "Could you please walk me through the data flow from the daemon WebSocket message all the way to the rendered AgentMessage segment, including the buffering and flush logic in between? I'd like to understand the failure modes when the daemon disconnects mid-stream."
  }
}`,...s.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    label: "alice",
    text: "Reviewing the diff now."
  }
}`,...r.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    text: "Here is what I want:\\n- step one\\n- step two\\n- step three\\n\\nThanks!"
  }
}`,...a.parameters?.docs?.source}}};const M=["Default","ShortMessage","LongMessage","CustomLabel","MultilineInput"];export{r as CustomLabel,e as Default,s as LongMessage,a as MultilineInput,t as ShortMessage,M as __namedExportsOrder,x as default};

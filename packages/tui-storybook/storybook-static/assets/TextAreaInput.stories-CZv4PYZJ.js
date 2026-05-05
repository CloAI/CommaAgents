import{j as r}from"./jsx-runtime-BjG_zV1W.js";import{r as m}from"./index-C-D8K_XC.js";import{T as i}from"./TextAreaInput-DLKcg97H.js";import"./_commonjsHelpers-BosuxZz1.js";import"./parse-keypress-DxfFivvL.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-input-Dlgi9-AW.js";import"./use-focus-DyHGIeWN.js";import"./use-box-metrics-DIVmjLHY.js";import"./use-stdout-BKjaryTg.js";import"./useMouse.utils-Bg5NRmlo.js";import"./useMouseWheelScroll-C98WjfFd.js";import"./MouseContext-CW2BFv0K.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";const E={title:"Components/TextAreaInput",component:i,args:{value:"",placeholder:"Type here...",width:60,height:6},argTypes:{placeholder:{control:"text"},width:{control:"number"},height:{control:"number"}},parameters:{docs:{description:{component:"`TextAreaInput` is a controlled multi-line text area with soft-wrapping,\nan inverse-block cursor, and a vertical scrollbar that appears when\ncontent exceeds `height`. Meta+Enter triggers `onSubmit(trimmedValue)`."}}}};function s(e){const[l,p]=m.useState(e.value);return r.jsx(i,{...e,value:l,onChange:p})}const t={args:{placeholder:"Type a message... (⌥+Enter to submit)",onSubmit:e=>{console.log("[TextAreaInput] submit:",e)}},render:e=>r.jsx(s,{...e})},n={args:{value:"Some draft text the user has already typed.",width:60,height:6},render:e=>r.jsx(s,{...e})},o={args:{id:"notes-area",width:40,height:5,value:`Line 1: hello world
Line 2: this is a longer line that will soft-wrap when the column count is small
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
Line 12`},render:e=>r.jsx(s,{...e})},a={args:{width:"100%",height:12,placeholder:"Notes...",value:""},render:e=>r.jsx(s,{...e})};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: "Type a message... (\\u2325+Enter to submit)",
    onSubmit: (text: string) => {
      // eslint-disable-next-line no-console
      console.log("[TextAreaInput] submit:", text);
    }
  },
  render: args => <ControlledTextAreaInput {...args} />
}`,...t.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    value: "Some draft text the user has already typed.",
    width: 60,
    height: 6
  },
  render: args => <ControlledTextAreaInput {...args} />
}`,...n.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    id: "notes-area",
    width: 40,
    height: 5,
    value: "Line 1: hello world\\n" + "Line 2: this is a longer line that will soft-wrap when the column count is small\\n" + "Line 3\\nLine 4\\nLine 5\\nLine 6\\nLine 7\\nLine 8\\nLine 9\\nLine 10\\nLine 11\\nLine 12"
  },
  render: args => <ControlledTextAreaInput {...args} />
}`,...o.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    width: "100%",
    height: 12,
    placeholder: "Notes...",
    value: ""
  },
  render: args => <ControlledTextAreaInput {...args} />
}`,...a.parameters?.docs?.source}}};const j=["Empty","PreFilled","ScrollableContent","FullWidth"];export{t as Empty,a as FullWidth,n as PreFilled,o as ScrollableContent,j as __namedExportsOrder,E as default};

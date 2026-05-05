import{j as r}from"./jsx-runtime-BjG_zV1W.js";import{B as l,T as d}from"./parse-keypress-DxfFivvL.js";import{r as m}from"./index-C-D8K_XC.js";import{M as p}from"./MouseProvider-DXCC0fCI.js";import"./MouseContext-CW2BFv0K.js";import{B as i}from"./Button-BdKzwvGR.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-input-Dlgi9-AW.js";import"./use-stdout-BKjaryTg.js";import"./useMouse.utils-Bg5NRmlo.js";import"./use-focus-DyHGIeWN.js";import"./useMouseHover-DTQaVSsT.js";import"./defineTheme-DdZGqrht.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";function u({children:e}){return r.jsx(p,{children:e})}const G={title:"Components/Button",component:i,args:{label:"Confirm",variant:"primary",disabled:!1,onPress:()=>{}},argTypes:{variant:{control:{type:"inline-radio"},options:["primary","secondary","danger","ghost"]},disabled:{control:"boolean"}},decorators:[e=>r.jsx(u,{children:r.jsx(e,{})})]},a={},o={args:{variant:"danger",label:"Delete"}},t={args:{variant:"ghost",label:"Cancel"}},n={args:{disabled:!0,label:"Locked"}},s={render:()=>{const[e,c]=m.useState("(none)");return r.jsxs(l,{flexDirection:"column",gap:1,children:[r.jsxs(l,{gap:1,children:[r.jsx(i,{id:"confirm",label:"Confirm",variant:"primary",onPress:()=>c("Confirm")}),r.jsx(i,{id:"discard",label:"Discard",variant:"ghost",onPress:()=>c("Discard")}),r.jsx(i,{id:"delete",label:"Delete",variant:"danger",onPress:()=>c("Delete")})]}),r.jsxs(d,{dimColor:!0,children:["last pressed: ",e]})]})}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:"{}",...a.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    variant: "danger",
    label: "Delete"
  }
}`,...o.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    variant: "ghost",
    label: "Cancel"
  }
}`,...t.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    label: "Locked"
  }
}`,...n.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => {
    const [last, setLast] = useState("(none)");
    return <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          <Button id="confirm" label="Confirm" variant="primary" onPress={() => setLast("Confirm")} />
          <Button id="discard" label="Discard" variant="ghost" onPress={() => setLast("Discard")} />
          <Button id="delete" label="Delete" variant="danger" onPress={() => setLast("Delete")} />
        </Box>
        <Text dimColor>last pressed: {last}</Text>
      </Box>;
  }
}`,...s.parameters?.docs?.source},description:{story:`Three buttons in a row — exercises focus cycling (Tab) and mouse hover
across multiple components inside a single Ink tree.`,...s.parameters?.docs?.description}}};const _=["Primary","Danger","Ghost","Disabled","Toolbar"];export{o as Danger,n as Disabled,t as Ghost,a as Primary,s as Toolbar,_ as __namedExportsOrder,G as default};

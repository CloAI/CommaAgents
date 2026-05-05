import{j as e}from"./jsx-runtime-BjG_zV1W.js";import{T as r}from"./parse-keypress-DxfFivvL.js";import"./index-C-D8K_XC.js";import{B as a}from"./BorderedPanel-Q96qOL9j.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./defineTheme-DdZGqrht.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";const g={title:"Components/BorderedPanel",component:a,args:{header:"planner",children:e.jsx(r,{children:"Hello from inside the panel."})},argTypes:{header:{control:"text"},borderColor:{control:"color"},backgroundColor:{control:"color"},headerColor:{control:"color"}},parameters:{docs:{description:{component:"`BorderedPanel` draws a single-line bordered column with the header text\nembedded into the top border row. Colors fall back to the active theme."}}}},o={},t={args:{header:"warning",borderColor:"yellow",headerColor:"yellow",children:e.jsx(r,{children:"Something deserves your attention."})}},n={args:{header:"summary",borderColor:"cyan",children:e.jsxs(e.Fragment,{children:[e.jsx(r,{children:"Line one of the panel content."}),e.jsx(r,{children:"Line two of the panel content."}),e.jsx(r,{dimColor:!0,children:"Line three is dim."})]})}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:"{}",...o.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    header: "warning",
    borderColor: "yellow",
    headerColor: "yellow",
    children: <Text>Something deserves your attention.</Text>
  }
}`,...t.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    header: "summary",
    borderColor: "cyan",
    children: <>
        <Text>Line one of the panel content.</Text>
        <Text>Line two of the panel content.</Text>
        <Text dimColor>Line three is dim.</Text>
      </>
  }
}`,...n.parameters?.docs?.source}}};const f=["Default","ColoredBorder","MultilineContent"];export{t as ColoredBorder,o as Default,n as MultilineContent,f as __namedExportsOrder,g as default};

import{j as e}from"./jsx-runtime-BjG_zV1W.js";import{B as s,T as o}from"./parse-keypress-DxfFivvL.js";import"./index-C-D8K_XC.js";import{S as t}from"./Separator-CO4Wmo8i.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./defineTheme-DdZGqrht.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";const f={title:"Components/Separator",component:t,parameters:{docs:{description:{component:'`Separator` draws a horizontal divider line. With the default\n`width="full"`, it stretches to fill its parent flex container, so for\nstories we wrap it in a sized `<Box>`.'}}}},r={render:()=>e.jsxs(s,{flexDirection:"column",width:50,children:[e.jsx(o,{children:"Above the line"}),e.jsx(t,{}),e.jsx(o,{children:"Below the line"})]})},n={render:()=>e.jsxs(s,{flexDirection:"column",children:[e.jsx(o,{children:"Above (separator is 20 chars wide)"}),e.jsx(t,{width:20}),e.jsx(o,{children:"Below"})]})},i={render:()=>e.jsxs(s,{flexDirection:"column",width:60,gap:0,children:[e.jsx(o,{bold:!0,children:"Section A"}),e.jsx(o,{dimColor:!0,children:"Some content for section A."}),e.jsx(t,{}),e.jsx(o,{bold:!0,children:"Section B"}),e.jsx(o,{dimColor:!0,children:"Some content for section B."}),e.jsx(t,{}),e.jsx(o,{bold:!0,children:"Section C"}),e.jsx(o,{dimColor:!0,children:"Some content for section C."})]})};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="column" width={50}>
      <Text>Above the line</Text>
      <Separator />
      <Text>Below the line</Text>
    </Box>
}`,...r.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="column">
      <Text>Above (separator is 20 chars wide)</Text>
      <Separator width={20} />
      <Text>Below</Text>
    </Box>
}`,...n.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="column" width={60} gap={0}>
      <Text bold>Section A</Text>
      <Text dimColor>Some content for section A.</Text>
      <Separator />
      <Text bold>Section B</Text>
      <Text dimColor>Some content for section B.</Text>
      <Separator />
      <Text bold>Section C</Text>
      <Text dimColor>Some content for section C.</Text>
    </Box>
}`,...i.parameters?.docs?.source}}};const j=["FullWidth","FixedWidth","BetweenSections"];export{i as BetweenSections,n as FixedWidth,r as FullWidth,j as __namedExportsOrder,f as default};

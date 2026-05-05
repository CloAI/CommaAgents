import{j as e}from"./jsx-runtime-BjG_zV1W.js";import{B as o,T as c}from"./parse-keypress-DxfFivvL.js";import"./index-C-D8K_XC.js";import{S as a}from"./Scrollbar-Bb7C86Mx.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";const u={title:"Components/Scrollbar",component:a,args:{total:200,windowSize:20,offset:0,height:20},argTypes:{total:{control:{type:"number",min:1}},windowSize:{control:{type:"number",min:1}},offset:{control:{type:"number",min:0}},height:{control:{type:"number",min:1}}},parameters:{docs:{description:{component:"`Scrollbar` is a presentational vertical scrollbar driven by caller-owned\nstate — `total`, `windowSize`, and `offset`. The component itself owns\nno state; it just renders the geometry."}}}},t={args:{total:200,windowSize:20,offset:0,height:20}},r={args:{total:200,windowSize:20,offset:90,height:20}},n={args:{total:200,windowSize:20,offset:180,height:20}},i={args:{total:10,windowSize:20,offset:0,height:20}},s={render:()=>e.jsxs(o,{flexDirection:"row",gap:3,children:[e.jsxs(o,{flexDirection:"column",children:[e.jsx(c,{dimColor:!0,children:"top"}),e.jsx(o,{height:12,children:e.jsx(a,{total:200,windowSize:12,offset:0,height:12})})]}),e.jsxs(o,{flexDirection:"column",children:[e.jsx(c,{dimColor:!0,children:"mid"}),e.jsx(o,{height:12,children:e.jsx(a,{total:200,windowSize:12,offset:94,height:12})})]}),e.jsxs(o,{flexDirection:"column",children:[e.jsx(c,{dimColor:!0,children:"bot"}),e.jsx(o,{height:12,children:e.jsx(a,{total:200,windowSize:12,offset:188,height:12})})]})]})};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    total: 200,
    windowSize: 20,
    offset: 0,
    height: 20
  }
}`,...t.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    total: 200,
    windowSize: 20,
    offset: 90,
    height: 20
  }
}`,...r.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    total: 200,
    windowSize: 20,
    offset: 180,
    height: 20
  }
}`,...n.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  args: {
    total: 10,
    windowSize: 20,
    offset: 0,
    height: 20
  }
}`,...i.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="row" gap={3}>
      <Box flexDirection="column">
        <Text dimColor>top</Text>
        <Box height={12}>
          <Scrollbar total={200} windowSize={12} offset={0} height={12} />
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text dimColor>mid</Text>
        <Box height={12}>
          <Scrollbar total={200} windowSize={12} offset={94} height={12} />
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text dimColor>bot</Text>
        <Box height={12}>
          <Scrollbar total={200} windowSize={12} offset={188} height={12} />
        </Box>
      </Box>
    </Box>
}`,...s.parameters?.docs?.source}}};const B=["AtTop","Middle","AtBottom","ContentFits","SideBySide"];export{n as AtBottom,t as AtTop,i as ContentFits,r as Middle,s as SideBySide,B as __namedExportsOrder,u as default};

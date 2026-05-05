import{j as e}from"./jsx-runtime-BjG_zV1W.js";import{T as i,B as a}from"./parse-keypress-DxfFivvL.js";import"./index-C-D8K_XC.js";import{M as o}from"./MeasuredBox-C47jmQ__.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-box-metrics-DIVmjLHY.js";import"./use-stdout-BKjaryTg.js";const S={title:"Components/MeasuredBox",component:o,parameters:{docs:{description:{component:"`MeasuredBox` is an Ink `<Box>` that exposes its measured dimensions to\nits children via a render prop. The first frame renders empty while\nYoga performs the initial layout."}}}},t={render:()=>e.jsx(o,{borderStyle:"round",width:"50%",height:3,paddingX:1,children:({width:r,height:s})=>e.jsx(i,{children:`Measured: ${r}×${s}`})})},d={render:()=>e.jsx(a,{width:60,height:5,borderStyle:"single",children:e.jsx(o,{flexGrow:1,children:({width:r,height:s,left:l,top:c})=>e.jsx(i,{children:`w=${r} h=${s} left=${l} top=${c}`})})})},n={render:()=>e.jsxs(a,{flexDirection:"row",gap:2,width:70,children:[e.jsx(o,{borderStyle:"round",flexGrow:1,paddingX:1,children:({width:r})=>e.jsx(i,{color:"cyan",children:`Left: ${r}c`})}),e.jsx(o,{borderStyle:"round",flexGrow:2,paddingX:1,children:({width:r})=>e.jsx(i,{color:"green",children:`Right: ${r}c`})})]})};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  render: () => <MeasuredBox borderStyle="round" width="50%" height={3} paddingX={1}>
      {({
      width,
      height
    }) => <Text>{\`Measured: \${width}×\${height}\`}</Text>}
    </MeasuredBox>
}`,...t.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <Box width={60} height={5} borderStyle="single">
      <MeasuredBox flexGrow={1}>
        {({
        width,
        height,
        left,
        top
      }) => <Text>{\`w=\${width} h=\${height} left=\${left} top=\${top}\`}</Text>}
      </MeasuredBox>
    </Box>
}`,...d.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <Box flexDirection="row" gap={2} width={70}>
      <MeasuredBox borderStyle="round" flexGrow={1} paddingX={1}>
        {({
        width
      }) => <Text color="cyan">{\`Left: \${width}c\`}</Text>}
      </MeasuredBox>
      <MeasuredBox borderStyle="round" flexGrow={2} paddingX={1}>
        {({
        width
      }) => <Text color="green">{\`Right: \${width}c\`}</Text>}
      </MeasuredBox>
    </Box>
}`,...n.parameters?.docs?.source}}};const y=["Bordered","FillsAvailable","TwoSideBySide"];export{t as Bordered,d as FillsAvailable,n as TwoSideBySide,y as __namedExportsOrder,S as default};

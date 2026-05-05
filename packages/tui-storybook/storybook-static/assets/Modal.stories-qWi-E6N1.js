import{j as e}from"./jsx-runtime-BjG_zV1W.js";import{B as l,T as c}from"./parse-keypress-DxfFivvL.js";import{r as m}from"./index-C-D8K_XC.js";import{M as C}from"./useModal.context-B_3vPZ9w.js";import{u as O}from"./use-input-Dlgi9-AW.js";import{u as B}from"./useDebugRender-opVd3fBA.js";import{M as E}from"./MeasuredBox-C47jmQ__.js";import{u as S}from"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-stdout-BKjaryTg.js";import"./use-box-metrics-DIVmjLHY.js";function w(o){const t=m.useContext(C);if(t===null)throw new Error("useModal must be used within a ModalProvider");const n=m.useCallback(r=>{t.open(o,r)},[t,o]),s=m.useCallback(()=>{t.close(o)},[t,o]),i=m.useCallback(r=>{t.toggle(o,r)},[t,o]),a=t.isOpen(o),u=t.isTopmost(o),d=t.getData(o);return m.useMemo(()=>({isOpen:a,isTopmost:u,data:d,open:n,close:s,toggle:i}),[a,u,d,n,s,i])}function D(){const o=S();return m.useMemo(()=>({backdrop:{position:"absolute",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"},backdropColor:o.colors.muted,content:{flexDirection:"column",borderStyle:o.borders.style,borderColor:o.borders.color,paddingX:o.spacing.md,paddingY:o.spacing.sm,overflow:"hidden",flexShrink:0},title:{bold:o.typography.headerBold,color:o.colors.primary}}),[o])}function b(o,t){if(o===void 0)return;if(typeof o=="number")return o;const n=Number(o.slice(0,-1));if(!Number.isNaN(n))return Math.max(1,Math.floor(t*n/100))}const k=typeof process.stdin.setRawMode=="function";function h({modalId:o,title:t,children:n,width:s="80%",height:i="80%",closeOnEsc:a=!0}){const u=B("Modal",{props:{modalId:o,title:t,width:s,height:i}}),d=D(),{isOpen:r,isTopmost:M,close:T}=w(o);return O((R,y)=>{y.escape&&T()},{isActive:r&&M&&a&&k}),r?e.jsx(v,{theme:d,title:t,width:s,height:i,debugRef:u.ref,children:n}):null}function v(o){const{theme:t,title:n,width:s="80%",height:i="80%",children:a,debugRef:u}=o;return e.jsx(l,{ref:u,position:"absolute",width:"100%",height:"100%",children:e.jsx(E,{...t.backdrop,width:"100%",height:"100%",position:"absolute",children:({width:d,height:r})=>{const M=b(s,d)??Math.floor(d*.5),T=b(i,r);return e.jsxs(e.Fragment,{children:[e.jsx(l,{position:"absolute",width:d,height:r,children:e.jsx(c,{dimColor:!0,color:t.backdropColor,children:Array.from({length:r}).map(()=>" ".repeat(d)).join(`
`)})}),e.jsx(N,{theme:t,title:n,contentWidth:M,contentHeight:T,children:a})]})}})})}function N(o){const{theme:t,title:n,contentWidth:s,contentHeight:i,children:a}=o;return e.jsxs(l,{...t.content,width:s,height:i,children:[n?e.jsx(l,{marginBottom:1,flexShrink:0,children:e.jsx(c,{...t.title,children:n})}):null,a]})}function j({id:o}){const{open:t}=w(o);return m.useEffect(()=>{t()},[t]),null}const J={title:"Components/Modal",component:h},p={render:()=>e.jsxs(e.Fragment,{children:[e.jsx(j,{id:"demo-modal"}),e.jsx(h,{modalId:"demo-modal",title:"Confirm",width:"60%",height:10,children:e.jsxs(l,{flexDirection:"column",padding:1,children:[e.jsx(c,{children:"Are you sure you want to proceed?"}),e.jsx(l,{marginTop:1,children:e.jsx(c,{dimColor:!0,children:"Press Esc to dismiss."})})]})})]})},x={render:()=>e.jsxs(e.Fragment,{children:[e.jsx(j,{id:"small-modal"}),e.jsx(h,{modalId:"small-modal",title:"Notice",width:40,height:6,children:e.jsx(l,{padding:1,children:e.jsx(c,{children:"Saved successfully."})})})]})},f={render:()=>e.jsxs(e.Fragment,{children:[e.jsx(j,{id:"untitled-modal"}),e.jsx(h,{modalId:"untitled-modal",width:"50%",height:8,children:e.jsxs(l,{flexDirection:"column",padding:1,children:[e.jsx(c,{bold:!0,children:"No header"}),e.jsx(c,{dimColor:!0,children:"This modal omits the `title` prop."})]})})]})},g={render:()=>e.jsxs(e.Fragment,{children:[e.jsx(j,{id:"sticky-modal"}),e.jsx(h,{modalId:"sticky-modal",title:"Locked",width:"50%",height:8,closeOnEsc:!1,children:e.jsx(l,{padding:1,children:e.jsx(c,{children:"This modal cannot be dismissed with Esc."})})})]})};p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <>
      <OpenOnMount id="demo-modal" />
      <Modal modalId="demo-modal" title="Confirm" width="60%" height={10}>
        <Box flexDirection="column" padding={1}>
          <Text>Are you sure you want to proceed?</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to dismiss.</Text>
          </Box>
        </Box>
      </Modal>
    </>
}`,...p.parameters?.docs?.source}}};x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <>
      <OpenOnMount id="small-modal" />
      <Modal modalId="small-modal" title="Notice" width={40} height={6}>
        <Box padding={1}>
          <Text>Saved successfully.</Text>
        </Box>
      </Modal>
    </>
}`,...x.parameters?.docs?.source}}};f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <>
      <OpenOnMount id="untitled-modal" />
      <Modal modalId="untitled-modal" width="50%" height={8}>
        <Box flexDirection="column" padding={1}>
          <Text bold>No header</Text>
          <Text dimColor>This modal omits the \`title\` prop.</Text>
        </Box>
      </Modal>
    </>
}`,...f.parameters?.docs?.source}}};g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <>
      <OpenOnMount id="sticky-modal" />
      <Modal modalId="sticky-modal" title="Locked" width="50%" height={8} closeOnEsc={false}>
        <Box padding={1}>
          <Text>This modal cannot be dismissed with Esc.</Text>
        </Box>
      </Modal>
    </>
}`,...g.parameters?.docs?.source}}};const K=["Default","SmallFixedSize","Untitled","NotCloseableViaEsc"];export{p as Default,g as NotCloseableViaEsc,x as SmallFixedSize,f as Untitled,K as __namedExportsOrder,J as default};

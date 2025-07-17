// rollup.config.js
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js', // JS 入口文件
  output: {
    file: 'dist/bundle.js',
    format: 'esm', // 可选: iife (浏览器)、cjs (Node)、esm (现代浏览器)
    name: 'turinggsdk' // 当 format=iife 时必填，作为全局变量名
  },
  plugins: [
    nodeResolve(), // 解析 node_modules 中的第三方依赖
    commonjs()     // 将 CommonJS 模块转为 ESM
  ]
};
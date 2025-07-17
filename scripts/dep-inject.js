// scripts/inject-deps.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 模式下获取 __dirname 的替代方案
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 配置参数
const SDK_PACKAGE_PATH = path.resolve(__dirname, '../packages/sdk/package.json');
const OUTPUT_DIR = path.resolve(__dirname, '../packages/sdk/dist');

// 需要保留为 peerDependencies 的特殊包
const PRESERVE_PEER_DEPS = ['react', 'vue', 'svelte'];

async function injectDependencies() {
  try {
    // 读取原始 package.json
    const pkgJson = JSON.parse(await fs.readFile(SDK_PACKAGE_PATH, 'utf-8'));
    const { peerDependencies = {} } = pkgJson;

    // 安全检测：禁止直接修改源文件
    if (path.resolve(SDK_PACKAGE_PATH) === path.resolve(OUTPUT_DIR)) {
      throw new Error('Security Error: Cannot modify source files directly!');
    }

    // 合并 dependencies 和 peerDependencies
    const newDependencies = {
      ...pkgJson.dependencies,
      ...Object.fromEntries(
        Object.entries(peerDependencies)
          .filter(([pkg]) => !PRESERVE_PEER_DEPS.includes(pkg))
      )
    };

    // 创建待发布的 package.json
    const publishPkg = {
      ...pkgJson,
      dependencies: newDependencies,
      peerDependencies: Object.fromEntries(
        Object.entries(peerDependencies)
          .filter(([pkg]) => PRESERVE_PEER_DEPS.includes(pkg))
      )
    };

    // 写入构建目录
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'package.json'),
      JSON.stringify(publishPkg, null, 2)
    );

    console.log('✅ Dependencies injected successfully!');
  } catch (error) {
    console.error('❌ Injection failed:', error);
    process.exit(1);
  }
}

injectDependencies();
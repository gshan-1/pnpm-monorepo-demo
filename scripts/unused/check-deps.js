#!/usr/bin/env node

const depcheck = require('depcheck');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 冗余依赖检测工具
 * 检测项目中未使用的依赖包
 */
class DependencyChecker {
  constructor() {
    this.workspaceRoot = process.cwd();
    this.packagesDir = path.join(this.workspaceRoot, 'packages');
    this.results = {
      redundant: {},
      missing: {},
      devOnly: {}
    };
  }

  async checkAll() {
    console.log('🔍 开始检测冗余依赖...\n');
    
    // 检查根目录
    await this.checkPackage(this.workspaceRoot, 'root');
    
    // 检查所有子包
    const packages = fs.readdirSync(this.packagesDir)
      .filter(dir => fs.statSync(path.join(this.packagesDir, dir)).isDirectory());
    
    for (const pkg of packages) {
      const pkgPath = path.join(this.packagesDir, pkg);
      await this.checkPackage(pkgPath, pkg);
    }
    
    this.generateReport();
    return this.results;
  }

  async checkPackage(packagePath, packageName) {
    const options = {
      ignoreBinPackage: false,
      skipMissing: false,
      ignoreDirs: [
        'dist',
        'build', 
        'coverage',
        'node_modules',
        '.next',
        '.nuxt'
      ],
      ignoreMatches: [
        '@types/*',
        'eslint-*',
        'prettier',
        'husky',
        'lint-staged'
      ],
      parsers: {
        '*.js': depcheck.parser.es6,
        '*.jsx': depcheck.parser.jsx,
        '*.ts': depcheck.parser.typescript,
        '*.tsx': depcheck.parser.typescript
      },
      detectors: [
        depcheck.detector.requireCallExpression,
        depcheck.detector.importDeclaration,
        depcheck.detector.exportDeclaration,
        depcheck.detector.gruntLoadTaskCallExpression
      ],
      specials: [
        depcheck.special.eslint,
        depcheck.special.webpack,
        depcheck.special.jest
      ]
    };

    try {
      const result = await depcheck(packagePath, options);
      
      this.results.redundant[packageName] = {
        dependencies: result.dependencies || [],
        devDependencies: result.devDependencies || [],
        path: packagePath
      };
      
      this.results.missing[packageName] = result.missing || {};
      
      console.log(`📦 检测完成: ${packageName}`);
      
      if (result.dependencies.length > 0) {
        console.log(`  ❌ 冗余生产依赖: ${result.dependencies.join(', ')}`);
      }
      
      if (result.devDependencies.length > 0) {
        console.log(`  ⚠️  冗余开发依赖: ${result.devDependencies.join(', ')}`);
      }
      
      if (Object.keys(result.missing).length > 0) {
        console.log(`  🔍 缺失依赖: ${Object.keys(result.missing).join(', ')}`);
      }
      
      console.log('');
      
    } catch (error) {
      console.error(`❌ 检测 ${packageName} 时出错:`, error.message);
    }
  }

  generateReport() {
    console.log('📊 =================== 检测报告 ===================\n');
    
    let totalRedundant = 0;
    let totalMissing = 0;
    
    Object.entries(this.results.redundant).forEach(([pkg, data]) => {
      const redundantCount = data.dependencies.length + data.devDependencies.length;
      totalRedundant += redundantCount;
      
      if (redundantCount > 0) {
        console.log(`📦 ${pkg}:`);
        if (data.dependencies.length > 0) {
          console.log(`  🗑️  生产依赖 (${data.dependencies.length}): ${data.dependencies.join(', ')}`);
        }
        if (data.devDependencies.length > 0) {
          console.log(`  🛠️  开发依赖 (${data.devDependencies.length}): ${data.devDependencies.join(', ')}`);
        }
        console.log('');
      }
    });
    
    Object.entries(this.results.missing).forEach(([pkg, missing]) => {
      const missingCount = Object.keys(missing).length;
      totalMissing += missingCount;
      
      if (missingCount > 0) {
        console.log(`📦 ${pkg} - 缺失依赖:`);
        Object.entries(missing).forEach(([dep, files]) => {
          console.log(`  ⚠️  ${dep}: ${files.join(', ')}`);
        });
        console.log('');
      }
    });
    
    console.log('📈 =================== 统计信息 ===================');
    console.log(`🗑️  总冗余依赖: ${totalRedundant} 个`);
    console.log(`⚠️  总缺失依赖: ${totalMissing} 个`);
    
    if (totalRedundant > 0) {
      console.log('\n💡 建议执行: npm run deps:clean');
    }
    
    if (totalMissing > 0) {
      console.log('\n💡 建议手动安装缺失的依赖');
    }
    
    // 保存详细报告
    const reportPath = path.join(this.workspaceRoot, 'deps-check-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 详细报告已保存: ${reportPath}`);
  }
}

// 主函数
async function main() {
  try {
    const checker = new DependencyChecker();
    await checker.checkAll();
    
    // 返回错误码给 CI
    const hasIssues = Object.values(checker.results.redundant)
      .some(data => data.dependencies.length > 0 || data.devDependencies.length > 0);
    
    process.exit(hasIssues ? 1 : 0);
  } catch (error) {
    console.error('❌ 检测过程中发生错误:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DependencyChecker;

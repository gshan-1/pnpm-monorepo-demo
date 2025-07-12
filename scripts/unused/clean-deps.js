#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DependencyChecker = require('./check-deps');

/**
 * 冗余依赖清理工具
 * 自动清理未使用的依赖包
 */
class DependencyCleaner {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.interactive = options.interactive || false;
    this.workspaceRoot = process.cwd();
    this.backupDir = path.join(this.workspaceRoot, '.deps-backup');
  }

  async clean() {
    console.log('🧹 开始清理冗余依赖...\n');
    
    if (this.dryRun) {
      console.log('🔍 运行模式: 预览 (不会实际修改文件)\n');
    }
    
    // 先检测冗余依赖
    const checker = new DependencyChecker();
    const results = await checker.checkAll();
    
    // 创建备份
    if (!this.dryRun) {
      this.createBackup();
    }
    
    // 清理每个包的冗余依赖
    for (const [packageName, data] of Object.entries(results.redundant)) {
      if (data.dependencies.length > 0 || data.devDependencies.length > 0) {
        await this.cleanPackage(packageName, data);
      }
    }
    
    // 重新安装依赖
    if (!this.dryRun) {
      console.log('📦 重新安装依赖...');
      try {
        execSync('pnpm install', { stdio: 'inherit' });
        console.log('✅ 依赖重新安装完成\n');
      } catch (error) {
        console.error('❌ 重新安装依赖失败:', error.message);
        console.log('🔄 正在恢复备份...');
        this.restoreBackup();
        throw error;
      }
    }
    
    this.generateCleanReport(results);
  }

  createBackup() {
    console.log('💾 创建备份...');
    
    if (fs.existsSync(this.backupDir)) {
      fs.rmSync(this.backupDir, { recursive: true });
    }
    fs.mkdirSync(this.backupDir, { recursive: true });
    
    // 备份根目录 package.json
    const rootPkg = path.join(this.workspaceRoot, 'package.json');
    if (fs.existsSync(rootPkg)) {
      fs.copyFileSync(rootPkg, path.join(this.backupDir, 'root-package.json'));
    }
    
    // 备份所有子包的 package.json
    const packagesDir = path.join(this.workspaceRoot, 'packages');
    if (fs.existsSync(packagesDir)) {
      const packages = fs.readdirSync(packagesDir);
      packages.forEach(pkg => {
        const pkgPath = path.join(packagesDir, pkg, 'package.json');
        if (fs.existsSync(pkgPath)) {
          fs.copyFileSync(pkgPath, path.join(this.backupDir, `${pkg}-package.json`));
        }
      });
    }
    
    console.log(`✅ 备份已创建: ${this.backupDir}\n`);
  }

  restoreBackup() {
    if (!fs.existsSync(this.backupDir)) {
      console.log('❌ 备份不存在，无法恢复');
      return;
    }
    
    console.log('🔄 从备份恢复...');
    
    // 恢复根目录
    const rootBackup = path.join(this.backupDir, 'root-package.json');
    if (fs.existsSync(rootBackup)) {
      fs.copyFileSync(rootBackup, path.join(this.workspaceRoot, 'package.json'));
    }
    
    // 恢复子包
    const backupFiles = fs.readdirSync(this.backupDir);
    backupFiles.forEach(file => {
      if (file.endsWith('-package.json') && file !== 'root-package.json') {
        const pkgName = file.replace('-package.json', '');
        const targetPath = path.join(this.workspaceRoot, 'packages', pkgName, 'package.json');
        fs.copyFileSync(path.join(this.backupDir, file), targetPath);
      }
    });
    
    console.log('✅ 备份恢复完成');
  }

  async cleanPackage(packageName, data) {
    const packagePath = packageName === 'root' 
      ? path.join(this.workspaceRoot, 'package.json')
      : path.join(this.workspaceRoot, 'packages', packageName, 'package.json');
    
    if (!fs.existsSync(packagePath)) {
      console.log(`⚠️  跳过 ${packageName}: package.json 不存在`);
      return;
    }
    
    console.log(`🧹 清理 ${packageName}...`);
    
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    let modified = false;
    
    // 清理生产依赖
    if (data.dependencies.length > 0 && packageJson.dependencies) {
      data.dependencies.forEach(dep => {
        if (packageJson.dependencies[dep]) {
          console.log(`  🗑️  移除生产依赖: ${dep}`);
          if (!this.dryRun) {
            delete packageJson.dependencies[dep];
            modified = true;
          }
        }
      });
    }
    
    // 清理开发依赖
    if (data.devDependencies.length > 0 && packageJson.devDependencies) {
      data.devDependencies.forEach(dep => {
        if (packageJson.devDependencies[dep]) {
          console.log(`  🗑️  移除开发依赖: ${dep}`);
          if (!this.dryRun) {
            delete packageJson.devDependencies[dep];
            modified = true;
          }
        }
      });
    }
    
    // 保存修改
    if (modified && !this.dryRun) {
      fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`  ✅ ${packageName} 清理完成`);
    } else if (this.dryRun) {
      console.log(`  👀 ${packageName} 预览完成 (未实际修改)`);
    }
    
    console.log('');
  }

  generateCleanReport(results) {
    console.log('📊 =================== 清理报告 ===================\n');
    
    let totalCleaned = 0;
    let estimatedSavings = 0;
    
    Object.entries(results.redundant).forEach(([pkg, data]) => {
      const cleanedCount = data.dependencies.length + data.devDependencies.length;
      if (cleanedCount > 0) {
        totalCleaned += cleanedCount;
        estimatedSavings += cleanedCount * 2.5; // 估算每个包平均 2.5MB
        
        console.log(`📦 ${pkg}: 清理了 ${cleanedCount} 个依赖`);
      }
    });
    
    console.log(`\n🎉 清理完成! 总共清理了 ${totalCleaned} 个冗余依赖`);
    console.log(`💾 预计节省磁盘空间: ~${estimatedSavings.toFixed(1)}MB`);
    console.log(`⚡ 预计减少安装时间: ~${(totalCleaned * 0.5).toFixed(1)}s`);
    
    if (!this.dryRun) {
      console.log(`\n💾 备份位置: ${this.backupDir}`);
      console.log('🔄 如需恢复，请运行: node scripts/restore-backup.js');
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    interactive: args.includes('--interactive') || args.includes('-i')
  };
  
  try {
    const cleaner = new DependencyCleaner(options);
    await cleaner.clean();
    console.log('🎉 依赖清理完成!');
  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DependencyCleaner;
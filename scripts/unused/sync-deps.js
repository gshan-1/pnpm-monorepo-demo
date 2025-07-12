#!/usr/bin/env node
// # 创建依赖同步脚本
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 重复依赖同步工具
 * 统一管理和同步依赖版本
 */
class DependencySync {
  constructor(options = {}) {
    this.strategy = options.strategy || 'workspace-first'; // 'workspace-first' | 'latest' | 'manual'
    this.autoFix = options.autoFix !== false;
    this.workspaceRoot = process.cwd();
    this.packagesDir = path.join(this.workspaceRoot, 'packages');
    this.duplicates = new Map();
    this.conflicts = [];
  }

  async sync() {
    console.log('🔄 开始同步重复依赖...\n');
    console.log(`📋 同步策略: ${this.strategy}\n`);
    
    // 1. 扫描所有依赖
    await this.scanAllDependencies();
    
    // 2. 检测重复和冲突
    this.detectDuplicatesAndConflicts();
    
    // 3. 生成修复建议
    const fixPlan = this.generateFixPlan();
    
    // 4. 应用修复
    if (this.autoFix && fixPlan.length > 0) {
      await this.applyFixes(fixPlan);
    }
    
    // 5. 生成报告
    this.generateReport(fixPlan);
    
    return {
      duplicates: Array.from(this.duplicates.entries()),
      conflicts: this.conflicts,
      fixPlan
    };
  }

  async scanAllDependencies() {
    console.log('🔍 扫描所有包的依赖...');
    
    this.allDependencies = new Map();
    
    // 扫描根目录
    this.scanPackageDependencies(this.workspaceRoot, 'root');
    
    // 扫描所有子包
    if (fs.existsSync(this.packagesDir)) {
      const packages = fs.readdirSync(this.packagesDir)
        .filter(dir => fs.statSync(path.join(this.packagesDir, dir)).isDirectory());
      
      packages.forEach(pkg => {
        const pkgPath = path.join(this.packagesDir, pkg);
        this.scanPackageDependencies(pkgPath, pkg);
      });
    }
    
    console.log(`✅ 扫描完成，共发现 ${this.allDependencies.size} 个包\n`);
  }

  scanPackageDependencies(packagePath, packageName) {
    const packageJsonPath = path.join(packagePath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = {
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      peerDependencies: packageJson.peerDependencies || {}
    };
    
    this.allDependencies.set(packageName, {
      path: packagePath,
      packageJson,
      dependencies: deps
    });
    
    console.log(`  📦 ${packageName}: ${Object.keys(deps.dependencies).length} deps, ${Object.keys(deps.devDependencies).length} devDeps`);
  }

  detectDuplicatesAndConflicts() {
    console.log('🔍 检测重复依赖和版本冲突...\n');
    
    const allDepVersions = new Map(); // depName -> { version -> [packages] }
    
    // 收集所有依赖版本信息
    this.allDependencies.forEach((data, packageName) => {
      ['dependencies', 'devDependencies'].forEach(depType => {
        Object.entries(data.dependencies[depType]).forEach(([depName, version]) => {
          if (!allDepVersions.has(depName)) {
            allDepVersions.set(depName, new Map());
          }
          
          const versionMap = allDepVersions.get(depName);
          if (!versionMap.has(version)) {
            versionMap.set(version, []);
          }
          
          versionMap.get(version).push({
            package: packageName,
            type: depType,
            path: data.path
          });
        });
      });
    });
    
    // 检测重复和冲突
    allDepVersions.forEach((versionMap, depName) => {
      if (versionMap.size > 1) {
        // 存在版本冲突
        const versions = Array.from(versionMap.entries());
        this.duplicates.set(depName, versions);
        
        const conflict = {
          dependency: depName,
          versions: versions.map(([version, packages]) => ({
            version,
            packages: packages.map(p => p.package),
            locations: packages
          })),
          severity: this.calculateSeverity(versions)
        };
        
        this.conflicts.push(conflict);
        
        console.log(`⚠️  发现冲突: ${depName}`);
        versions.forEach(([version, packages]) => {
          console.log(`    ${version}: ${packages.map(p => p.package).join(', ')}`);
        });
        console.log('');
      }
    });
  }

  calculateSeverity(versions) {
    // 计算冲突严重程度
    const majorVersions = new Set();
    versions.forEach(([version]) => {
      const major = version.replace(/[^\d.].*$/, '').split('.')[0];
      majorVersions.add(major);
    });
    
    if (majorVersions.size > 1) return 'high';
    if (versions.length > 2) return 'medium';
    return 'low';
  }

  generateFixPlan() {
    console.log('📋 生成修复计划...\n');
    
    const fixPlan = [];
    
    this.conflicts.forEach(conflict => {
      const targetVersion = this.selectTargetVersion(conflict);
      
      const fix = {
        dependency: conflict.dependency,
        targetVersion,
        changes: []
      };
      
      conflict.versions.forEach(versionData => {
        if (versionData.version !== targetVersion) {
          versionData.locations.forEach(location => {
            fix.changes.push({
              package: location.package,
              path: location.path,
              type: location.type,
              from: versionData.version,
              to: targetVersion
            });
          });
        }
      });
      
      if (fix.changes.length > 0) {
        fixPlan.push(fix);
        console.log(`🎯 ${conflict.dependency}: ${targetVersion}`);
        fix.changes.forEach(change => {
          console.log(`    ${change.package}: ${change.from} → ${change.to}`);
        });
        console.log('');
      }
    });
    
    return fixPlan;
  }

  selectTargetVersion(conflict) {
    switch (this.strategy) {
      case 'workspace-first':
        // 优先使用 workspace 根目录的版本
        const rootVersion = conflict.versions.find(v => 
          v.packages.includes('root')
        );
        if (rootVersion) return rootVersion.version;
        // 如果根目录没有，使用最新版本
        return this.getLatestVersion(conflict.versions);
      
      case 'latest':
        return this.getLatestVersion(conflict.versions);
      
      default:
        return conflict.versions[0].version;
    }
  }

  getLatestVersion(versions) {
    // 简单的版本排序，实际项目中应该使用 semver
    return versions
      .map(v => v.version)
      .sort((a, b) => {
        const aClean = a.replace(/[^\d.]/g, '');
        const bClean = b.replace(/[^\d.]/g, '');
        return bClean.localeCompare(aClean, undefined, { numeric: true });
      })[0];
  }

  async applyFixes(fixPlan) {
    console.log('🔧 应用修复...\n');
    
    for (const fix of fixPlan) {
      console.log(`🔄 修复 ${fix.dependency} → ${fix.targetVersion}`);
      
      for (const change of fix.changes) {
        const packageJsonPath = path.join(change.path, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (packageJson[change.type] && packageJson[change.type][fix.dependency]) {
          packageJson[change.type][fix.dependency] = fix.targetVersion;
          
          fs.writeFileSync(
            packageJsonPath, 
            JSON.stringify(packageJson, null, 2) + '\n'
          );
          
          console.log(`  ✅ ${change.package}: ${change.from} → ${change.to}`);
        }
      }
    }
    
    // 重新安装依赖
    console.log('\n📦 重新安装依赖...');
    try {
      execSync('pnpm install', { stdio: 'inherit' });
      console.log('✅ 依赖重新安装完成\n');
    } catch (error) {
      console.error('❌ 重新安装依赖失败:', error.message);
      throw error;
    }
  }

  generateReport(fixPlan) {
    console.log('📊 =================== 同步报告 ===================\n');
    
    console.log(`🔍 检测到 ${this.conflicts.length} 个依赖冲突`);
    console.log(`🔧 生成了 ${fixPlan.length} 个修复计划`);
    
    if (this.conflicts.length > 0) {
      console.log('\n📋 冲突详情:');
      this.conflicts.forEach(conflict => {
        console.log(`  ⚠️  ${conflict.dependency} (${conflict.severity} 风险)`);
        conflict.versions.forEach(v => {
          console.log(`    ${v.version}: ${v.packages.join(', ')}`);
        });
      });
    }
    
    if (fixPlan.length > 0) {
      console.log('\n🎯 修复建议:');
      fixPlan.forEach(fix => {
        console.log(`  ✅ ${fix.dependency}: 统一到 ${fix.targetVersion}`);
        console.log(`    影响 ${fix.changes.length} 个包: ${fix.changes.map(c => c.package).join(', ')}`);
      });
    }
    
    // 保存详细报告
    const report = {
      timestamp: new Date().toISOString(),
      strategy: this.strategy,
      conflicts: this.conflicts,
      fixPlan: fixPlan,
      duplicates: Array.from(this.duplicates.entries())
    };
    
    const reportPath = path.join(this.workspaceRoot, 'deps-sync-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 详细报告已保存: ${reportPath}`);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const options = {
    strategy: args.includes('--latest') ? 'latest' : 'workspace-first',
    autoFix: !args.includes('--no-fix')
  };
  
  try {
    const sync = new DependencySync(options);
    const result = await sync.sync();
    
    console.log('🎉 依赖同步完成!');
    
    // 返回错误码给 CI
    const hasConflicts = result.conflicts.some(c => c.severity === 'high');
    process.exit(hasConflicts ? 1 : 0);
  } catch (error) {
    console.error('❌ 同步过程中发生错误:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DependencySync;
import {execSync} from 'child_process'
import chalk from 'chalk';
try{
    // 检查 pnpm-lock.yaml 是否最新是一个关键前置检查，必须确保检查完成后才能决定是否允许提交代码。
    // 
    execSync('pnpm install --frozen-lockfile',{stdio:'inherit'})
    console.log('✅ Lockfile is up to date.')
    process.exit(0); // 成功退出

    // 
}catch(e){
    console.error(chalk.red(`
        ❌ 锁文件或子包依赖存在问题！
        修复步骤：
        1. 运行 pnpm install
        2. 提交更新的 pnpm-lock.yaml
        3. 检查子包依赖版本是否冲突
    `));
    console.error(e)
    process.exit(1); // 立即终止提交
}
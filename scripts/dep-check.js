// const fs = require('fs')
// console.log(__dirname)
// console.log(import.meta)

import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'

const depTypes = ['dependencies', 'devDependencies', 'peerDependencies']
// 找到上级目录
const __dirname = path.join(import.meta.dirname, '../')
console.log(__dirname)

// 下述代码等于直接取 import.meta.dirname，冗余了
// const name = path.dirname(fileURLToPath(import.meta.url)) 

function readPkgJson(filePath) {
    try {
        const pkgJson = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(pkgJson)
    } catch (e) {
        console.error(e)
        return null
    }
}
/**
 * 
 */
function compareDependencies(rootDeps, childDeps, depType, childName) {
    const dupDefine = []
    for (const [dep, version] of Object.entries(childDeps)) {
        if (rootDeps[dep]) {
            const isSameVersion = (rootDeps[dep] === version);
            dupDefine.push(
                `${dep}：${version} （在根目录中为：${rootDeps[dep]}）` +
                `${isSameVersion ? chalk.greenBright('✅') : chalk.greenBright('❌')} } `
            )
        }
    }
    return {
        dupDefine: dupDefine.length > 0 ? `${chalk.greenBright('- 重叠的', depType)}\n` + dupDefine.join('\n') + '\n\n' : `${chalk.greenBright('- 无重叠',depType)}\n`,
    }
}

function findSubPackageJsons(rootDir) {
    try {
        const packagesPath = path.join(rootDir, 'packages')
        console.log({ __dirname })
        return fs.readdirSync(packagesPath, { withFileTypes: true })
            .filter(item => item.isDirectory())
            .map(dir => {
                const pkgPath = path.join(packagesPath, dir.name, 'package.json')
                try {
                    return fs.statSync(pkgPath).isFile() ? pkgPath : null
                } catch (e) {
                    return null
                }
            })
            .filter(Boolean)
    } catch (e) {
        console.warn(`[警告] 无法读取目录 ${rootDir}:`, e.message)
        return []
    }
}
function main() {
    const rootPackageJsonPath = path.join(__dirname, 'package.json');
    const rootPackageJson = readPkgJson(rootPackageJsonPath)
    // console.log({ rootPackageJson })
    if (!rootPackageJson) {
        console.error('无法读取根目录的 package.json 文件')
        return
    }
    // console.log(111,fs.readdirSync(packagesPath),)
    const subPkgPaths = findSubPackageJsons(__dirname)
    console.log({ subPkgPaths })
    const subPkgJsonDatas = subPkgPaths.map((itemPath) => ({ data: readPkgJson(itemPath), path: itemPath, dir: path.dirname(itemPath) }))
    console.log({ subPkgJsonDatas })


    for (const jsonData of subPkgJsonDatas) {
        const { data: subPackageJson, dir } = jsonData
        if (subPackageJson) {
            console.log(chalk.bold(`✨ 子项目${dir}`))
            for (const depType of depTypes) {
                const { dupDefine } = compareDependencies(rootPackageJson[depType] || {}, subPackageJson[depType] || {}, depType, dir)
                console.log(dupDefine)
            }
        }
    }
    // console.log({childPath})

}



main()
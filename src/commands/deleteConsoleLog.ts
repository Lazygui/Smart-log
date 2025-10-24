
import * as vscode from 'vscode';
import { CallExpression, Node, Project, SourceFile, SyntaxKind } from 'ts-morph';
import { getFileType, getCustomize, Customize } from './index'

interface ConsoleLogInfo {
    node: Node;
    start: number;
    end: number;
    line: number;
    character: number;
    text: string;
}

interface VueScriptInfo {
    scriptContent: string;
    scriptStartOffset: number;
}
let highlightDecorationType: vscode.TextEditorDecorationType;
/**
 * 从 Vue 文件中提取 script 内容
 */
function extractVueScriptContent(sourceCode: string): VueScriptInfo | null {
    const scriptMatch = sourceCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch && scriptMatch.index !== undefined) {
        const scriptStartOffset = scriptMatch.index + scriptMatch[0].indexOf('>') + 1;
        return {
            scriptContent: scriptMatch[1],
            scriptStartOffset: scriptStartOffset
        };
    }
    return null;
}

/**
 * 将 TS-Morph 中的位置转换为 VSCode 文档位置（考虑 Vue 文件偏移）
 */
function convertToDocumentPosition(
    line: number,
    character: number,
    document: vscode.TextDocument,
    vueScriptInfo?: VueScriptInfo
): vscode.Position {
    if (vueScriptInfo) {
        const scriptStartPosition = document.positionAt(vueScriptInfo.scriptStartOffset);
        const absoluteLine = scriptStartPosition.line + line;
        const absoluteCharacter = (line === 0)
            ? scriptStartPosition.character + character
            : character;
        return new vscode.Position(absoluteLine, absoluteCharacter);
    }

    return new vscode.Position(line, character);
}

/**
 * 查找所有 console.log 语句
 */
function findConsoleLogs(scriptContent: string, sourceFile: SourceFile): ConsoleLogInfo[] {
    const consoleLogs: ConsoleLogInfo[] = []
    sourceFile.forEachDescendant((node: Node) => {
        if (node.getKind() === SyntaxKind.CallExpression) {
            const callExpr = node as CallExpression;
            const expression = callExpr.getExpression();

            if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
                const propAccess = expression as any;
                const leftSide = propAccess.getExpression();
                const propertyName = propAccess.getName();

                if (leftSide.getText() === 'console' && propertyName === 'log') {
                    const start = node.getStart();
                    let end = node.getEnd();

                    // 检查后面是否有分号
                    const textAfter = scriptContent.substring(end, end + 1);
                    if (textAfter === ';') {
                        end += 1; // 包含分号
                    }

                    const lineAndColumn = sourceFile.getLineAndColumnAtPos(start);

                    consoleLogs.push({
                        node: node,
                        start: start,
                        end: end,
                        line: lineAndColumn.line - 1,
                        character: lineAndColumn.column - 1,
                        text: node.getText() + (textAfter === ';' ? ';' : '')
                    });
                }
            }
        }
    });

    return consoleLogs;
}
/**
 * 高亮显示 console.log 语句
 */
function highlightConsoleLogs(
    editor: vscode.TextEditor,
    consoleLogs: ConsoleLogInfo[],
    document: vscode.TextDocument,
    sourceFile: SourceFile,
    vueScriptInfo?: VueScriptInfo,
): void {
    // 清除之前的高亮
    if (highlightDecorationType) {
        highlightDecorationType.dispose();
    }

    // 创建新的高亮装饰器
    highlightDecorationType = createHighlightDecoration();

    // 计算高亮范围
    const ranges: vscode.Range[] = consoleLogs.map(log => {
        const startPos = convertToDocumentPosition(log.line, log.character, document, vueScriptInfo);

        // 修正：使用 TS-Morph 计算的行列信息，而不是 document.positionAt
        const endLineAndColumn = sourceFile.getLineAndColumnAtPos(log.end);
        const endPos = convertToDocumentPosition(
            endLineAndColumn.line - 1,  // TS-Morph 的行号从1开始，VSCode 从0开始
            endLineAndColumn.column - 1, // TS-Morph 的列号从1开始，VSCode 从0开始
            document,
            vueScriptInfo
        );

        return new vscode.Range(startPos, endPos);
    });

    // 应用高亮
    editor.setDecorations(highlightDecorationType, ranges);
}

/**
 * 创建高亮装饰器
 */
function createHighlightDecoration(): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)', // 半透明红色背景
        border: '1px solid yellow', // 红色边框
        borderRadius: '2px', // 圆角边框
        overviewRulerColor: 'red', // 在滚动条上的颜色
        overviewRulerLane: vscode.OverviewRulerLane.Right // 在右侧滚动条显示
    });
}
const handler = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        return;
    }

    // 判断是否为 Vue 文件并提取内容
    const fileType = getFileType(editor)
    if (!fileType) {
        vscode.window.showWarningMessage('插件仅支持 .vue | .js | .ts | .jsx | .tsx 格式文件');
        return
    }

    const document = editor.document;

    // 获取文件内容
    const sourceCode = document.getText();
    let scriptContent: string = sourceCode
    let vueScriptInfo: VueScriptInfo | undefined;

    if (fileType === 'vue') {
        const extracted = extractVueScriptContent(sourceCode);
        if (extracted) {
            scriptContent = extracted.scriptContent;
            vueScriptInfo = extracted;
        } else {
            vscode.window.showInformationMessage('未发现 console.log 语句！');
            return;
        }
    }

    const project = new Project({
        useInMemoryFileSystem: true,
    });

    const sourceFile = project.createSourceFile('temp.ts', scriptContent);
    // 查找 console.log 语句
    const consoleLogs = findConsoleLogs(scriptContent, sourceFile);

    if (consoleLogs.length === 0) {
        vscode.window.showInformationMessage('未发现 console.log 语句！');
        return;
    }

    const customize = getCustomize(Customize.DeletHighlight)
    if (customize && customize === 'on') {
        highlightConsoleLogs(editor, consoleLogs, document, sourceFile, vueScriptInfo);
    }
    // 询问用户是否要删除
    const userChoice = await vscode.window.showWarningMessage(
        `发现 ${consoleLogs.length} 处 console.log 语句. 您是否需要删除他们?`,
        '是的，删除所有',
        '取消'
    );

    if (userChoice === '是的，删除所有') {
        if (customize && customize === 'on') {
            highlightDecorationType.dispose();
        }
        try {
            const edits: vscode.TextEdit[] = [];

            consoleLogs.forEach(log => {
                const startPos = convertToDocumentPosition(log.line, log.character, document, vueScriptInfo);
                const endPos = convertToDocumentPosition(
                    sourceFile.getLineAndColumnAtPos(log.end).line - 1,
                    sourceFile.getLineAndColumnAtPos(log.end).column - 1,
                    document,
                    vueScriptInfo
                );

                const range = new vscode.Range(startPos, endPos);
                edits.push(vscode.TextEdit.delete(range));
            });

            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, edits);

            await vscode.workspace.applyEdit(workspaceEdit);

            vscode.window.showInformationMessage('成功删除');

        } catch (error) {
            vscode.window.showErrorMessage(`删除失败：${error}`);
        }
    }
};
// 导出命令
export default {
    name: 'smart-log.deleteConsoleLog',
    handler,
};
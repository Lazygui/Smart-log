
import * as vscode from 'vscode';
import { Node, Project, SourceFile, ts, VariableDeclaration } from 'ts-morph';
import insertConsoleLogCommand from './insertConsoleLog'
import deleteConsoleLogCommand from './deleteConsoleLog'


export type Command = {
  name: string,
  handler: () => Promise<void>;
}

export function getAllCommands(): Array<Command> {
  return [
    insertConsoleLogCommand,
    deleteConsoleLogCommand
  ];
}
export const insertConsoleLog = (rows: number, logStatement: string) => {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }
  const insertPos: vscode.Position = new vscode.Position(rows, 0);
  editor.edit(editBuilder => {
    editBuilder.insert(insertPos, logStatement);
  })
}
export function getSelectedNode(): { node: Node<ts.Node>, editor: vscode.TextEditor, sourceFile: SourceFile } | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }
  const selection = editor.selection;
  // 如果没有选中文本
  if (selection.isEmpty) {
    return;
  }
  const project = new Project({
    useInMemoryFileSystem: true,
  });
  const document = editor.document;

  // 获取文件内容
  const sourceCode = document.getText();

  // 使用 ts-morph 创建源文件
  const sourceFile = project.createSourceFile(document.fileName, sourceCode);
  const selectionStart = editor.document.offsetAt(editor.selection.start);
  const node = sourceFile.getDescendantAtPos(selectionStart);
  if (!node) {
    return
  }
  return { node, editor, sourceFile }
}


/**
 * 获取给定节点所在的最内层函数名称。
 * 
 * @param node - 任意 TypeScript 节点
 * @returns 函数名称（如 "foo"），如果不在任何函数内部或函数无名称，则返回 null
 */
export function getFunctionName(node: Node): string | null {
  const functionNode = node.getFirstAncestor(ancestor =>
    Node.isFunctionDeclaration(ancestor) ||
    Node.isMethodDeclaration(ancestor) ||
    Node.isFunctionExpression(ancestor) ||
    Node.isArrowFunction(ancestor)
  );

  if (!functionNode) {
    return null;
  }

  // 函数声明和方法声明直接获取名称
  if (Node.isFunctionDeclaration(functionNode) || Node.isMethodDeclaration(functionNode)) {
    return functionNode.getName() || null;
  }

  // 函数表达式和箭头函数：查找其所在的变量声明或属性赋值
  if (Node.isFunctionExpression(functionNode) || Node.isArrowFunction(functionNode)) {
    const parent = functionNode.getParent();

    if (Node.isVariableDeclaration(parent)) {
      return parent.getName() || null;
    }

    if (Node.isPropertyAssignment(parent)) {
      return parent.getName() || null;
    }

    // 处理更多情况，如对象字面量方法简写
    if (Node.isMethodDeclaration(parent)) {
      return parent.getName() || null;
    }
  }

  return null;
}

/**
 * 向上查找节点最父级声明节点，没有返回undefined
 * @param node 选中的节点
 * @returns 最父级的声明节点或undefined
 */
export function getParentVariableDeclaration(node: Node): VariableDeclaration | undefined {
  return node.getFirstAncestor(Node.isVariableDeclaration);
}

export enum Customize {
  Suffix = "suffix",
  DeletHighlight = "deletHighlight"
}
/**
 * 用户自定义属性值
 * @param customize 自定义属性名称
 * @returns 自定义属性值
 */
export function getCustomize(customize: Customize): string | undefined {
  return vscode.workspace.getConfiguration()?.get(`smart-log.${customize}`)
}
const fileTypes = ['vue', 'ts', 'js', 'tsx', 'jsx'] as const
type FileTypes = typeof fileTypes[number] 
/**
 * 当前文件类型
 * @param editor 
 * @returns 文件类型
 */
export function getFileType(editor: vscode.TextEditor): FileTypes | undefined {
  const filePath = editor.document.fileName;
  const pop = filePath.split('.').pop()
  if(!pop){
    return
  }
  const extension = pop.toLowerCase() as FileTypes | undefined
  // 检查 extension 是否在 fileTypes 中
  if (extension && fileTypes.includes(extension)) {
    return extension;
  }
  return
}
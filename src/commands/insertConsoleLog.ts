import * as vscode from 'vscode';
import { Node, SyntaxKind, SourceFile, CallExpression } from 'ts-morph';
import { getSelectedNode, insertConsoleLog, getFunctionName, getParentVariableDeclaration } from './index'

type IProperty = {
	endLine: number;
	selected: string | null;
} | undefined;

/**
 * 收集属性名
 * @param node 
 * @returns 
 */
const getsegments = (node: Node): string => {
	// 收集属性路径
	const segments: string[] = [];
	// 收集属性路径
	let current: Node | undefined = node.getParent()
	while (current) {
		if (Node.isPropertyAssignment(current)) {
			segments.unshift(current.getName());
		} else if (Node.isVariableDeclaration(current)) {
			segments.unshift(current.getName());
			break;
		}
		current = current.getParent();
	}
	return segments.join('.')
}
const propertyAccessExpression = (node: Node, sourceFile: SourceFile): IProperty | undefined => {
	const varNode = getParentVariableDeclaration(node)
	// 属性访问在声明变量里例如：const objName = {name:6,info:{abc:obj.age}} 选中age
	if (varNode) {
		const selected = getsegments(node)
		const endLine = sourceFile.getLineAndColumnAtPos(varNode.getEnd()).line;
		return { endLine, selected };
	}
	const propertyAccess = node.getParentIfKind(SyntaxKind.PropertyAccessExpression);
	if (!propertyAccess) return;

	const pathSegments: string[] = [];

	function collectFullPath(expr: Node): void {
		if (Node.isPropertyAccessExpression(expr)) {
			// 递归处理左侧表达式
			collectFullPath(expr.getExpression());
			// 收集当前属性名
			pathSegments.push(expr.getNameNode().getText());

		} else if (Node.isIdentifier(expr)) {
			// 基础变量名
			pathSegments.push(expr.getText());
		}
	}

	collectFullPath(propertyAccess);
	const selected = pathSegments.join('.');
	return { endLine: -1, selected };
}

const propertyAssignment = (node: Node, selection: vscode.Selection, sourceFile: SourceFile): IProperty => {

	let endLine = selection.active.line;


	// 向上遍历找到变量声明
	const varNode = getParentVariableDeclaration(node)
	if (!varNode) {
		return;
	}
	// 收集属性路径
	const segments: string = getsegments(node)
	// 设置结束行 - 使用 ts-morph 的正确方法
	const endPos = varNode.getEnd();
	const lineAndChar = sourceFile.getLineAndColumnAtPos(endPos);
	endLine = lineAndChar.line;

	return {
		endLine,
		selected: segments
	};
};
const callExpression = (node: Node, sourceFile: SourceFile): IProperty | undefined => {
	const varNode = getParentVariableDeclaration(node)
	if (varNode) {		
		const endLine = sourceFile.getLineAndColumnAtPos(varNode.getEnd()).line;
		const selected = varNode.getName()
		return { endLine, selected };
	}
	const parent = node.getParent() as CallExpression
	const expression = parent.getExpression();
	const argumentsList = parent.getArguments();
	let endLine = sourceFile.getLineAndColumnAtPos(node.getEnd()).line
	// 情况1：fun(params1)选中的是函数名fun
	if (Node.isIdentifier(node) && node === expression) {
		return {
			endLine,
			selected: null
		};
	}
	// 情况2：fun(params1)选中的是参数params1
	else if (argumentsList.includes(node as any)) {
		endLine = endLine - 1
		return {
			endLine,
			selected: null
		};
	}
	return
}
const handler = async () => {
	// 查找选中文本对应的节点
	const nodes = getSelectedNode()

	if (!nodes) {
		return;
	}
	const { node, editor, sourceFile } = nodes
	const selection = editor.selection;
	const document = editor.document
	const select = document.getText(selection)
	// 选中项的行号
	let endLine = selection.active.line + 1
	// 选中项内容
	let selected = select
	const parent = node.getParent()
	console.log('Parent Kind parent:', endLine, SyntaxKind[parent!.getKind()]);
	// 对象内触发例如:const a={b:10}选中b 打印信息==>console.log("🚀 ~ line:**:", a.b);
	if (Node.isPropertyAssignment(parent)) {
		const res = propertyAssignment(node, selection, sourceFile)
		if (res) {
			endLine = res.endLine
			selected = res.selected || selected
		}
	} else if (Node.isPropertyAccessExpression(parent)) {
		const res = propertyAccessExpression(node, sourceFile)
		if (res) {
			selected = res.selected || selected
			endLine = res.endLine === -1 ? endLine - 1 : res.endLine
		}
	} 
	// 声明触发const varNode = 1选中varNode时声明结束下方打印varNode
	else if (Node.isVariableDeclaration(parent)) {
		// 获取变量声明的结束位置
		const endPos = parent.getEnd();
		// 将位置转换为行号
		endLine = sourceFile.getLineAndColumnAtPos(endPos).line;
	} 
	// 函数调用触发
	// 1.存在声明const 打印声明变量
	// 2.直接调用fun(params1) 
	//	（1）选中fun将在下行打印fun
	//	（2）选中params1将在上行打印params1
	else if (Node.isCallExpression(parent)) {
		const res = callExpression(node, sourceFile)
		if (res) {
			endLine = res.endLine
			selected = res.selected || selected
		}
	}
	// console.log('endLine ==== >', endLine);
	const funName = getFunctionName(node)
	const endLineText = `line:${endLine + 1}`
	const logStatement = `console.log("🚀 ~ ${!funName ? endLineText : funName} ~ ${select}:", ${selected});\n`;
	insertConsoleLog(endLine, logStatement)

}

// 导出命令
export default {
	name: 'smart-log.insertConsoleLog',
	handler,
};
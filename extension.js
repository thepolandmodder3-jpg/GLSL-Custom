const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

let diagnosticCollection;

function activate(context) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('glsl-custom');
    context.subscriptions.push(diagnosticCollection);

    if (vscode.window.activeTextEditor) {
        runValidator(vscode.window.activeTextEditor.document, context);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                runValidator(editor.document, context);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            runValidator(document, context);
        })
    );
}

function runValidator(document, context) {
    if (document.languageId !== 'glsl') {
        return;
    }

    const filePath = document.fileName;
    const platform = process.platform; // Wykrywa 'win32' lub 'linux'

    let validatorBinary;
    let platformFolder;

    // Automatyczny wybór folderu i pliku na podstawie systemu
    if (platform === 'win32') {
        validatorBinary = 'glslangValidator.exe';
        platformFolder = 'win32';
    } else {
        validatorBinary = 'glslangValidator';
        platformFolder = 'linux';
    }

    // Budowanie dynamicznej ścieżki: bin/win32/... lub bin/linux/...
    const validatorPath = path.join(context.extensionPath, 'bin', platformFolder, validatorBinary);

    let cmd;
    if (filePath.toLowerCase().endsWith('.glsl')) {
        cmd = `"${validatorPath}" -S frag "${filePath}"`;
    } else {
        cmd = `"${validatorPath}" "${filePath}"`;
    }

    exec(cmd, (error, stdout, stderr) => {
        diagnosticCollection.set(document.uri, []);

        const output = stdout || stderr;
        if (!output) return;

        const diagnostics = [];
        const errorRegex = /(ERROR|WARNING):\s+(\d+):(\d+):\s+(.*)/g;
        let match;

        while ((match = errorRegex.exec(output)) !== null) {
            const severityStr = match[1];
            const lineNum = parseInt(match[3], 10) - 1;
            const errorMessage = match[4];

            if (lineNum >= 0 && lineNum < document.lineCount) {
                const lineText = document.lineAt(lineNum).text;
                const range = new vscode.Range(lineNum, 0, lineNum, lineText.length);

                const severity = severityStr === 'ERROR' 
                    ? vscode.DiagnosticSeverity.Error 
                    : vscode.DiagnosticSeverity.Warning;

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `[GLSL] ${errorMessage}`,
                    severity
                );
                diagnostics.push(diagnostic);
            }
        }

        if (diagnostics.length > 0) {
            diagnosticCollection.set(document.uri, diagnostics);
        }
    });
}

function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};
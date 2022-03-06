import React from 'react';
import ActionButton from 'Editor/Util/ActionButton/ActionButton';
import { Console } from 'console-feed'

export default function ConsolePanel(props) {
    function clearConsole() {
        props.setConsoleLogs([]);
    }

    return (
        <div className="wick-code-editor-console">
            <div className="we-code-console-bar">
                <div className="we-code-console-title">'Console'</div>
                <div className="we-code-console-options-container">
                    <ActionButton
                    className="we-code-console-option we-code-clear-console"
                    id="clear-console-button"
                    icon="clear"
                    action={clearConsole}
                    tooltip="Clear Console"
                    tooltipPlace="left"
                    color='tool' />
                </div>

            </div>
            
            <Console logs={props.consoleLogs} variant="dark"/>
        </div>
    )
}
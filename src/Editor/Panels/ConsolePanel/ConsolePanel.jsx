import React from 'react';
import ActionButton from 'Editor/Util/ActionButton/ActionButton';
import { Console } from 'console-feed'
import { ReflexContainer, ReflexElement } from 'react-reflex'

export default function ConsolePanel(props) {
    function clearConsole() {
        props.setConsoleLogs([]);
    }

    return (
        <div className="wick-code-editor-console">
            <ReflexContainer orientation="horizontal">
                <ReflexElement
                size={40} // ok????????? not in pixels?? what unit is this?
                className="we-code-console-bar"> {/* we-code-console-bar */}
                    <div className="outliner-title-name">Console</div>
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
                </ReflexElement>
                
                <ReflexElement>
                    <Console logs={props.consoleLogs} variant="dark"/>
                </ReflexElement>
            </ReflexContainer>
        </div>
    )
}
import React, { Component } from 'react';

import ActionButton from 'Editor/Util/ActionButton/ActionButton';

import './_consoleexpandbutton.scss';

var classNames = require("classnames");

class ConsoleExpandButton extends Component {
  render () {
    
    return (
      <ActionButton
      color="tool"
      isActive={ () => false }
      id="console-toggle"
      tooltip={this.props.expanded ? "Hide Console" : "Show Console"}
      action={this.props.toggleConsole}
      tooltipPlace="right"
      icon="outliner"
      className="console-expand-button"
      iconClassName={classNames("console-toggle-icon", {"console-expand-button-closed": !this.props.expanded})}
      />
    );
  }
}

export default ConsoleExpandButton
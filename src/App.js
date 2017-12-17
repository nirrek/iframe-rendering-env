// @flow
import React, { Component } from 'react';
import { range } from 'ramda';
import { BrowserRouter, Route } from 'react-router-dom';
import JXG from 'jsxgraph';

type Props = {};
type State = {
  numGraphs: number,
  numGraphsInput: number,
  increaseAmount: number,
};

class Home extends Component<Props, State> {
  state = {
    numGraphs:
      parseInt(window.localStorage.getItem('numGraphsInput'), 10) || 50,
    numGraphsInput:
      parseInt(window.localStorage.getItem('numGraphsInput'), 10) || 50,
    increaseAmount: 5,
  };

  componentDidMount() {
    window.addEventListener('message', event => {
      if (
        ['render', 'renderComplete', 'cloneComplete'].includes(event.data.type)
      )
        console.log('MESSAGE', event.data.type, event.data);
    });
  }

  render() {
    return (
      <div style={{ paddingBottom: 750 }}>
        <div
          style={{
            position: 'fixed',
            zIndex: 10000000000,
            background: 'white',
            width: '100%',
            padding: 10,
            top: 0,
            boxShadow: '0 1px 3px rgba(0,0,0, .3)',
          }}
        >
          <h3 style={{ margin: 0 }}>
            Total graphplots: {this.state.numGraphs}
          </h3>
          <input
            type="number"
            value={this.state.numGraphsInput}
            onChange={e =>
              this.setState({
                numGraphsInput: parseInt(e.target.value, 10),
              })}
          />
          <button
            onClick={() => {
              window.localStorage.setItem(
                'numGraphsInput',
                this.state.numGraphsInput,
              );
              window.location.reload();
              // this.setState({ numGraphs: this.state.numGraphsInput });
            }}
          >
            Redo clean render with {this.state.numGraphsInput || 0} graphplots
          </button>
          <br />
          <input
            type="number"
            value={this.state.increaseAmount}
            onChange={e =>
              this.setState({
                increaseAmount: parseInt(e.target.value, 10),
              })}
          />
          <button
            onClick={() =>
              this.setState(state => ({
                ...state,
                numGraphs: state.numGraphs + (this.state.increaseAmount || 0),
              }))}
          >
            Add {this.state.increaseAmount || 0}
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 80 }}>
          {range(0, this.state.numGraphs).map(i => (
            <div key={i} style={{ margin: 5 }}>
              <GraphPlotIframe />
            </div>
          ))}
        </div>
      </div>
    );
  }
}

// We are going to use singleton state so that all instances of a
// GraphPlotIframe can have a distinct graphId which will be used when
// demultiplexing the global message event bus.
let graphId = 0;
let iframe;
let isIframeLoaded = false;
let pendingCompletion = [];

class GraphPlotIframe extends Component<{}, {}> {
  root: ?HTMLElement;
  graphId: string;

  constructor(props) {
    super(props);
    this.graphId = String(graphId++);
  }

  injectIframe = () => {
    if (iframe == null) {
      iframe = document.createElement('iframe');
      iframe.width = '250px';
      iframe.height = '250px';
      iframe.src = '/graph';
      iframe.frameBorder = 'none';
      iframe.style.position = 'fixed';
      iframe.style.visibility = 'hidden';
      iframe.style.zIndex = '-1';
      iframe.style.top = '0px';
      iframe.style.left = '0px';

      iframe.addEventListener('load', () => {
        isIframeLoaded = true;
        this.renderGraph(iframe);
      });

      if (document.body) document.body.appendChild(iframe);
    } else if (!isIframeLoaded) {
      // This case occurs when you render multiple <GraphPlotIframe> components
      // in a single render pass, when there is currently no cached iframe. This
      // is because the first <GraphPlotIframe> will inject the iframe, but the
      // iframe won't have finished loading by the time the next <GraphPlotIframe>
      // has finished mounting.
      iframe.addEventListener('load', () => {
        this.renderGraph(iframe);
      });
    } else {
      // Fully loaded iframe is available so we can pass messages immediately
      this.renderGraph(iframe);
    }

    // TODO register this as a 'pendingCompletion' then remove
    // the iframe when pendingCompletion is empty on the cloneCompletion event.
    // also set isIframeLoaded flag to false.
  };

  componentDidMount() {
    this.injectIframe();

    window.addEventListener('message', ({ data }) => {
      if (data.type !== 'renderComplete' || data.graphId !== this.graphId)
        return;

      const { renderElementId } = data;
      const clone = iframe.contentWindow.document
        .querySelector(`#${renderElementId}`)
        .cloneNode(true);

      if (this.root) this.root.appendChild(clone);

      iframe.contentWindow.postMessage(
        {
          type: 'cloneComplete',
          graphId: this.graphId,
        },
        '*',
      );
    });
  }

  renderGraph = iframe => {
    iframe.contentWindow.postMessage(
      {
        type: 'render',
        graphId: this.graphId,
        graphData: {},
      },
      '*',
    );
  };

  render() {
    return (
      <div
        ref={node => (this.root = node)}
        style={{ border: '1px solid #333' }}
      />
    );
  }
}

class Graph extends Component<void, { graphs: string[] }> {
  state = {
    graphs: [],
  };

  loadedGraphs = {};

  componentDidMount() {
    // Not in iframe so dont do our iframe logic
    if (!window.top) return;

    window.addEventListener('message', ({ data }) => {
      console.log('GRAPH receive message for', data.graphId);
      if (data.type === 'render') {
        // TODO pass this data eventually
        const { graphId } = data;

        this.setState(state => ({
          graphs: [...state.graphs, graphId],
        }));
      }

      if (data.type === 'cloneComplete') {
        this.setState(state => ({
          graphs: state.graphs.filter(g => g !== data.graphId),
        }));
      }
    });
  }

  render() {
    const randomNumber = () => Math.floor(Math.random() * 10) - 5;

    return this.state.graphs.map(graphId => {
      const elementId = `graph-${graphId}`;
      return (
        <div
          key={elementId}
          id={elementId}
          style={{ width: 250, height: 250 }}
          ref={node => {
            if (!node) return;
            if (this.loadedGraphs[graphId]) return;
            this.loadedGraphs[graphId] = true;
            const board = JXG.JSXGraph.initBoard(elementId, {
              boundingbox: [-7, 7, 7, -7],
              axis: true,
            });
            board.create('functiongraph', [x => Math.sin(x)]);
            board.create('functiongraph', [
              x => Math.cos(x) * 5 * Math.sin(Number(graphId) * Math.PI / 4),
            ]);
            board.create('point', [randomNumber(), randomNumber()], {
              name: 'X',
              size: 4,
            });
            board.create('point', [randomNumber(), randomNumber()], {
              name: 'B',
              size: 4,
            });
            board.create('point', [randomNumber(), randomNumber()], {
              name: 'C',
              size: 4,
            });
            board.create('point', [randomNumber(), randomNumber()], {
              name: 'D',
              size: 4,
            });
            board.create('point', [randomNumber(), randomNumber()], {
              name: 'E',
              size: 4,
            });
            board.create('polygon', ['X', 'B', 'C', 'D', 'E']);
            window.top.postMessage(
              {
                type: 'renderComplete',
                graphId,
                renderElementId: elementId,
              },
              '*',
            );
          }}
        />
      );
    });
  }
}

class App extends Component<void, void> {
  render() {
    return (
      <BrowserRouter>
        <div>
          <Route exact path="/" component={Home} />
          <Route exact path="/graph" component={Graph} />
        </div>
      </BrowserRouter>
    );
  }
}

export default App;

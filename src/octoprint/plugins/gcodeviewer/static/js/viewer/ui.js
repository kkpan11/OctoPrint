/**
 * User: hudbrog (hudbrog@gmail.com)
 * Date: 10/21/12
 * Time: 7:45 AM
 */

var GCODE = {};

GCODE.ui = (function () {
    var uiOptions = {
        container: undefined,
        toolOffsets: undefined,
        bedDimensions: undefined,
        onProgress: undefined,
        onModelLoaded: undefined,
        onLayerSelected: undefined,
        onFileLoaded: undefined
    };

    var setProgress = function (type, progress) {
        if (uiOptions["onProgress"]) {
            uiOptions.onProgress(type, progress);
        }
    };

    var switchLayer = function (layerNum, onlyInfo) {
        if (!onlyInfo) {
            var segmentCount = GCODE.renderer.getLayerNumSegments(layerNum);
            GCODE.renderer.render(layerNum, 0, segmentCount - 1);
        }

        if (uiOptions["onLayerSelected"]) {
            var z = GCODE.renderer.getZ(layerNum);
            var modelInfo = GCODE.gCodeReader.getModelInfo();
            uiOptions.onLayerSelected({
                number: layerNum,
                height: z,
                commands: GCODE.renderer.getLayerNumSegments(layerNum),
                filament: GCODE.gCodeReader.getLayerFilament(z),
                printTime: modelInfo ? modelInfo.printTimeByLayer[z] : undefined
            });
        }
    };

    var switchCommands = function (layerNum, first, last) {
        GCODE.renderer.render(layerNum, first, last);
    };

    var processMessage = function (e) {
        var data = e.data;
        switch (data.cmd) {
            case "returnModel":
                if (uiOptions["onFileLoaded"]) {
                    uiOptions.onFileLoaded();
                }
                GCODE.ui.worker.postMessage({
                    cmd: "analyzeModel",
                    msg: {}
                });
                break;

            case "analyzeDone":
                setProgress("done", 100);

                GCODE.gCodeReader.processAnalyzeModelDone(data.msg);
                var activeModel = GCODE.gCodeReader.passDataToRenderer();

                if (uiOptions["onModelLoaded"]) {
                    uiOptions.onModelLoaded({
                        width: data.msg.modelSize.x,
                        depth: data.msg.modelSize.y,
                        height: data.msg.modelSize.z,
                        filament: data.msg.totalFilament,
                        printTime: data.msg.printTime,
                        layerHeight: data.msg.layerHeight,
                        layersPrinted: data.msg.layerCnt,
                        layersTotal: data.msg.layerTotal,
                        layersActive: activeModel.length
                    });
                }
                switchLayer(0);
                break;

            case "returnLayers":
                GCODE.gCodeReader.processLayersFromWorker(data.msg);
                setProgress("parsing", data.msg.progress / 2);
                break;

            case "analyzeProgress":
                setProgress("analyzing", 50 + data.msg.progress / 2);
                break;
        }
    };

    var checkCapabilities = function () {
        var warnings = [];
        var fatal = [];

        var errorList = document.getElementById("errorList");

        if (!window.Worker) {
            fatal.push(
                "<li>Your browser doesn't seem to support HTML5 Web Workers, GCode Viewer won't work without it.</li>"
            );
        }

        if (fatal.length > 0) {
            if (errorList) {
                errorList.innerHTML = "<ul>" + fatal.join("") + "</ul>";
            }
            console.log("Initialization failed: unsupported browser.");
            return false;
        }

        if (!Modernizr.webgl && GCODE.renderer3d) {
            warnings.push(
                "<li>Your browser doesn't seem to support HTML5 Web GL, 3d mode is not recommended, going to be SLOW!</li>"
            );
            GCODE.renderer3d.setOption({rendererType: "canvas"});
        }

        if (warnings.length > 0) {
            if (errorList) {
                errorList.innerHTML = "<ul>" + warnings.join("") + "</ul>";
            }
            console.log("Initialization succeeded with warnings.", warnings);
        }
        return true;
    };

    var setOptions = function (options) {
        if (!options) return;
        for (var opt in options) {
            if (options[opt] === undefined) continue;
            if (options.hasOwnProperty(opt)) {
                uiOptions[opt] = options[opt];
            }
        }
    };

    return {
        worker: undefined,
        init: function (options) {
            if (options) setOptions(options);
            if (!options.container) {
                return false;
            }

            var capabilitiesResult = checkCapabilities();
            if (!capabilitiesResult) {
                return false;
            }

            setProgress("", 0);

            this.worker = new Worker(GCODE_WORKER);
            this.worker.addEventListener("message", processMessage, false);

            GCODE.renderer.setOption({
                container: options.container,
                bed: options.bed
            });
            GCODE.gCodeReader.setOption({
                toolOffsets: options.toolOffsets,
                bed: options.bed,
                bedZ: options.bedZ
            });
            GCODE.renderer.render(0, 0);

            return true;
        },

        clear: function () {
            GCODE.gCodeReader.clear();
            GCODE.renderer.clear();

            setProgress("", 0);
            if (uiOptions["onLayerSelected"]) {
                uiOptions.onLayerSelected();
            }
            if (uiOptions["onModelLoaded"]) {
                uiOptions.onModelLoaded();
            }
        },

        resetViewport: function () {
            GCODE.renderer.resetViewport();
        },

        updateLayerInfo: function (layerNum) {
            switchLayer(layerNum, true);
        },

        updateOptions: function (options) {
            setOptions(options.ui);
            if (options.reader) {
                GCODE.gCodeReader.setOption(options.reader);
            }
            if (options.renderer) {
                GCODE.renderer.setOption(options.renderer);
            }
        },

        changeSelectedLayer: function (newLayerNum) {
            switchLayer(newLayerNum);
        },

        changeSelectedCommands: function (layerNum, first, last) {
            switchCommands(layerNum, first, last);
        }
    };
})();

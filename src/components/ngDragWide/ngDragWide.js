import TweenLite from './lib/gsap/TweenLite.js'
import CSSPlugIn from './lib/gsap/CSSPlugin.js'
import ThrowPropsPlugin from './lib/gsap/ThrowPropsPlugin.js'
import Draggable from './lib/gsap/Draggable.js'

const tool = {

    ngDragWide: function(opts) {
        const settings = {
            selector: "#ng-graphic-wrap",
            offsetX:0,
            offsetY:0
        }
        Object.assign(settings, opts);

        var wrap = document.querySelector(settings.selector);
        var dragWrap = wrap.querySelector(".ng-drag-wrap")
        var drag = dragWrap.querySelector(".ng-drag");
        var button = dragWrap.querySelector(".ng-drag-button");

        TweenLite.set(drag, { x: settings.offsetX, y: settings.offsetY });


        var draggable = Draggable.create(drag, {
            type: "x",
            bounds: dragWrap,
            lockAxis: true,
            throwProps: true,
            onDragStart: function(evt) {
                button.classList ? button.classList.add('ng-hidden') : button.className += ' ng-hidden';
            },
        });

        (function() {
            var throttle = function(type, name, obj) {
                obj = obj || window;
                var running = false;
                var func = function() {
                    if (running) {
                        return;
                    }
                    running = true;
                    requestAnimationFrame(function() {
                        obj.dispatchEvent(new CustomEvent(name));
                        running = false;
                    });
                };
                obj.addEventListener(type, func);
            };

            /* init - you can init any event */
            throttle("resize", "optimizedResize");
        })();

        // handle event
        window.addEventListener("optimizedResize", function() {
            draggable.forEach(function(d) {
                d.applyBounds(dragWrap)
            })
        });
    }
}

export default tool.ngDragWide
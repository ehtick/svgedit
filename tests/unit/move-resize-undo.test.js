import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Regression test for https://github.com/SVG-Edit/svgedit/issues/1090:
// moving a shape and then resizing it must not lose the move when the
// resize is undone. Also covers https://github.com/SVG-Edit/svgedit/issues/1086:
// resizing must flatten into the shape's real geometry attributes (so the
// coordinate/size panel inputs stay in sync) instead of leaving a scale
// transform matrix on the element.
describe('Issue 1090/1086: move then resize then undo', function () {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'

    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)

    // jsdom doesn't implement getScreenCTM or SVGTransformList#replaceItem;
    // stub them so mouse-driven interactions can be exercised end-to-end.
    const svgElementProto = window.SVGElement && window.SVGElement.prototype
    if (svgElementProto && !svgElementProto.getScreenCTM) {
      svgElementProto.getScreenCTM = function () {
        const m = this.createSVGMatrix()
        m.inverse = () => this.createSVGMatrix()
        return m
      }
    }
    if (window.SVGTransformList && !window.SVGTransformList.prototype.replaceItem) {
      window.SVGTransformList.prototype.replaceItem = function (item, index) {
        this._items[index] = item
        return item
      }
    }

    svgCanvas = new SvgCanvas(
      document.getElementById('svgcanvas'), {
        canvas_expansion: 3,
        dimensions: [640, 480],
        initFill: { color: 'FF0000', opacity: 1 },
        initStroke: { width: 5, color: '000000', opacity: 1 },
        initOpacity: 1,
        imgPath: '../editor/images',
        langPath: 'locale/',
        extPath: 'extensions/',
        extensions: [],
        initTool: 'select',
        wireframe: false
      }
    )
  })

  function fakeEvt (x, y, target) {
    return {
      button: 0,
      clientX: x,
      clientY: y,
      target,
      preventDefault () {},
      shiftKey: false
    }
  }

  function findResizeGrip () {
    const grips = svgCanvas.selectorManager.selectorParentGroup
    const dataStorage = svgCanvas.getDataStorage()
    for (const el of grips.querySelectorAll('*')) {
      if (dataStorage.get(el, 'type') === 'resize') { return el }
    }
    return null
  }

  function testTag (tag, attrs) {
    it(`move then resize then undo restores the moved position for <${tag}>`, function () {
      const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')
      svgCanvas.setSvgString(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><${tag} id="shape1" ${attrStr}/></svg>`
      )
      const elem = document.getElementById('shape1')
      svgCanvas.clearSelection()
      svgCanvas.addToSelection([elem])

      // MOVE: drag from (50,50) to (100,110) -> dx=50, dy=60
      svgCanvas.mouseDownEvent(fakeEvt(50, 50, elem))
      svgCanvas.mouseMoveEvent(fakeEvt(60, 60, elem))
      svgCanvas.mouseMoveEvent(fakeEvt(100, 110, elem))
      svgCanvas.mouseUpEvent(fakeEvt(100, 110, elem))

      // RESIZE via the selector's resize grip
      const selector = svgCanvas.selectorManager.requestSelector(elem)
      selector.showGrips(true)
      const resizeGrip = findResizeGrip()
      assert.ok(resizeGrip, 'found a resize grip element')

      const afterMove = {}
      for (const k of Object.keys(attrs)) afterMove[k] = elem.getAttribute(k)

      svgCanvas.mouseDownEvent(fakeEvt(100, 110, resizeGrip))
      svgCanvas.mouseMoveEvent(fakeEvt(130, 150, resizeGrip))
      svgCanvas.mouseUpEvent(fakeEvt(130, 150, resizeGrip))

      const afterResize = {}
      for (const k of Object.keys(attrs)) afterResize[k] = elem.getAttribute(k)

      // The resize must flatten into the shape's real geometry attributes
      // (issue #1086), not just leave a scale matrix on the element.
      assert.notDeepEqual(afterResize, afterMove, `${tag}: resize should update geometry attrs, not just leave a transform`)
      assert.ok(!elem.getAttribute('transform'), `${tag}: resize should not leave a leftover transform attribute`)

      // UNDO the resize
      svgCanvas.undoMgr.undo()

      const afterUndo = {}
      for (const k of Object.keys(attrs)) afterUndo[k] = elem.getAttribute(k)

      // Undoing the resize must restore the post-MOVE geometry, not revert
      // all the way back to the shape's creation-time (pre-move) geometry.
      assert.notDeepEqual(afterUndo, attrs, `${tag}: undo(resize) should not revert to creation-time geometry`)
    })
  }

  testTag('rect', { x: 10, y: 10, width: 40, height: 30 })
  testTag('ellipse', { cx: 30, cy: 30, rx: 20, ry: 15 })

  function testResizeOnly (tag, attrs) {
    it(`resize-only (no prior move) updates geometry for <${tag}>`, function () {
      const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')
      svgCanvas.setSvgString(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><${tag} id="shape1" ${attrStr}/></svg>`
      )
      const elem = document.getElementById('shape1')
      svgCanvas.clearSelection()
      svgCanvas.addToSelection([elem])

      const selector = svgCanvas.selectorManager.requestSelector(elem)
      selector.showGrips(true)
      const resizeGrip = findResizeGrip()
      assert.ok(resizeGrip, 'found a resize grip element')

      svgCanvas.mouseDownEvent(fakeEvt(50, 40, resizeGrip))
      svgCanvas.mouseMoveEvent(fakeEvt(80, 80, resizeGrip))
      svgCanvas.mouseUpEvent(fakeEvt(80, 80, resizeGrip))

      const afterResize = {}
      for (const k of Object.keys(attrs)) afterResize[k] = elem.getAttribute(k)
      assert.notDeepEqual(afterResize, attrs, `${tag}: plain resize should update geometry attrs`)
      assert.ok(!elem.getAttribute('transform'), `${tag}: resize should not leave a leftover transform attribute`)
    })
  }

  testResizeOnly('rect', { x: 10, y: 10, width: 40, height: 30 })
  testResizeOnly('ellipse', { cx: 30, cy: 30, rx: 20, ry: 15 })
})

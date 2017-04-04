define([
    "dojo/_base/declare",
], function(declare) {
    "use strict";

    return declare("TreeView.widget.GridView.Record", null, {
        domNode: null, //correspinding render nodes
        grid: null,
        guid: null,

        _data: null,
        _subscription: null,
        _colNodes: null, //array with columnNodes
        _subs: null,
        checkbox: null, //checkbox node

        constructor: function (data, grid) {
            logger.debug("TreeView.widget.GridView.Record.constructor");
            this.guid = data.getGuid();
            this._data = data;
            this._colNodes = [];
            this._subs = [];

            this.grid = grid;

            this._subscription = grid.subscribe({
                guid: this.guid,
                callback: dojo.hitch(this, function (thing) {
                    //Do not update while suspended; all data will be fetch upon resume.
                    if (this.grid.isSuspended())
                        return;

                    if (this.grid.datasourcemf) {
                        //microflow data? retrieve by id
                        mx.data.get({
                            guid: this.guid,
                            callback: dojo.hitch(this, function (data) {
                                this.update(data);
                            }),
                            error: grid.showError
                        });
                    }
                    else {
                        //xpath datasource? retrieve by xpath, the object might no longer be in the grid constraint
                        mx.data.get({
                            xpath: grid.buildXpath() + "[id = \"" + this.guid + "\"]",
                            filter: grid.enableschema ? grid._schema : {},
                            callback: dojo.hitch(this, function (data) {
                                if (data.length > 0)
                                    this.update(data[0]);
                            }),
                            error: grid.showError
                        });
                    }
                })
            });

        },

        data: function () {
            return this._data;
        },

        update: function (data, firstTime) {
            logger.debug("TreeView.widget.GridView.Record.update");
            this._data = data;

            var curCol = 0;
            for (var i = 0, col = null; col = this.grid.columns[i]; i++) {
                var node = this._colNodes[curCol];
                col.render(this, node, firstTime === true);
                curCol += 1;
            }

            for (var key in this.grid.conditions) {
                var condition = this.grid.conditions[key];
                var clz = condition.getClass();
                if (clz) { //checking if class is cheaper than checking the condition itself
                    if (condition.appliesTo(this))
                        dojo.addClass(this.domNode, clz);
                    else
                        dojo.removeClass(this.domNode, clz);
                }
            }
        },

        setup: function (tablenode) {
            this.domNode = mxui.dom.create(this.grid.showasdiv ? "div" : "tr", {"class": "gv_row gv_row_" + tablenode.childElementCount});

            if (this.grid.showasdiv && this.grid.colheads.length > 0 && this.grid.colheads[0].getWidth())
                dojo.style(this.domNode, "width", this.grid.colheads[0].getWidth());

            mxui.dom.data(this.domNode, "data", this);

            this.checkbox = mxui.dom.create("input", {
                "type": "checkbox",
                "class": "gv_multiselect_checkbox",
                "style": this.grid.allowmultiselect === true ? "" : "display:none"
            });

            dojo.place(mxui.dom.create(this.grid.showasdiv ? "div" : "td", {
                "class": "gv_cell gv_cell_0 gv_cell_multiselect"
            }, this.checkbox), this.domNode);

            //create td"s
            for (var i = 0; i < this.grid.colheads.length; i++) {
                var cell = mxui.dom.create(this.grid.showasdiv ? "div" : "td", {
                    "class": "gv_cell gv_cell_" + this.grid.colheads[i].data.colheadname + " gv_cell_" + i
                });
                var colwrapper = mxui.dom.create("div", {"class": "gv_cell_wrapper"});

                dojo.place(colwrapper, cell);
                dojo.place(cell, this.domNode);
            }

            //create renderers
            for (i = 0; i < this.grid.columns.length; i++) {
                var col = this.grid.columns[i];

                if (1 * col.columnindex >= this.grid.colheads.length)
                    this.configError("Column index out of bounds: " + col.columnindex);

                var span = mxui.dom.create("span", {"class": "gv_column gv_column_" + i});
                this._colNodes.push(span);

                //wrapper node
                var cw = mxui.dom.create("span", {"class": "gv_column_wrapper"}, span);
                dojo.place(cw, this.domNode.childNodes[1 + 1 * col.columnindex].children[0]);

                col.setupNode(span);
            }

            this.update(this._data, true);
            dojo.place(this.domNode, tablenode);
        },

        addSubscription: function (subscription) {
            logger.debug("TreeView.widget.GridView.Record.addSubscription");
            this._subs.push(subscription);
        },

        free: function () {
            logger.debug("TreeView.widget.GridView.Record.free");
            if (this._destroyed)
                return;
            this._destroyed = true;

            dojo.forEach(this._subs, function (sub) {
                dojo.disconnect(sub);
            });

            dojo.destroy(this.domNode);

            if (this._subscription)
                this.grid.unsubscribe(this._subscription);

        }
    });
});

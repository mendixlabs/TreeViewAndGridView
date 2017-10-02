define([
    "dojo/_base/declare",
    "TreeView/widget/Commons",
    "TreeView/widget/Filters/MultiFilter",
    "TreeView/widget/Filters/BoolFilter",
    "TreeView/widget/Filters/EnumFilter"
], function(declare, Commons, MultiFilter, BoolFilter, EnumFilter) {
    "use strict";

    return declare("TreeView.widget.Filters.FilterManager", null, {
        widget: null,
        domNode : null,

        constructor : function(widget, data) {
            this.widget   = widget;

            if (!this.widget.filterexclusive) {
                this.filter = new MultiFilter(this, data);
                this.filters = this.filter.filters;
            } else {
                this.domNode = mxui.dom.create(
                    "div", { "class": "gv_filter_container" }
                );

                this.filters = dojo.map(data, function (d) {
                    if (Commons.getAttributeType(this.widget.entity, d.filterattr) == "Enum") {
                        return new EnumFilter(d, this);
                    } else {
                        return new BoolFilter(d, this);
                    }
                }, this);

            }
        },

        getSearchConstraints : function() {
            // var filters = (!this.filtersexclusive) ? this.filter.getFilters() : [];


            var combined = [];
            for (var i = 0; i < this.filters.length; i++) {
                var constraints = this.filters[i].getSearchConstraints();
                if (constraints.length > 0)
                    combined = combined.concat( constraints.join(" or ") );
            }
            var cs = combined.join(" ][ ");
            return cs.length > 0 ? "[" + cs + "]" : "";
        },

        free : function() {
            this.filter.free();
        },

        applyFilters : function() {
            this.widget.curpage = 0;
            this.widget.fetchAll();
        }
    });
});

dojo.require("TreeView.widget.Commons");
/**
 * Edge stores a single assocation from the database, e.g. guid -> assocname -> guid.
 * Parent / child is stored according to the rendering, not according to the owner.
 */
dojo.declare("TreeView.widget.Edge", null, {
	parent : null, //Graphnode
	name : '', //assocname
	child : null, //Graphnode
	owner : null, //Graphnode, either parent or child
	type : null, //type in tree
	tree : null,
	index : -1,

	constructor : function(type, parent, child, owner) {
		this.type  = type;
		this.name  = type.assoc;
		this.parent= parent;
		this.child = child;
		this.owner = owner;
		this.tree  = this.parent.tree;

		this.child._refs += 1; //increase the number of references

		//add the node for every known parent
		parent.forNodes(function(parentRenderNode) {
			if (parentRenderNode.children[type.index].collapsed == false) //already expanded parent, add this edge..
				new TreeView.widget.RenderNode(child, parentRenderNode, type);
		});
	},

	updateIndex : function(newindex) {
		if (this.index != newindex)	 {
			var edge = this;

			this.parent.forNodes(function (parentNode) {
				edge.child.forNodes(function(childNode) {
					parentNode.children[edge.type.index].move(childNode, newindex);
				});
			});

			this.index = newindex;
		}
	},

	free : function(){
		if (this._destroyed)
			return;
		this._destroyed = true;

		//1. remove the corresponding child render nodes for every know parent, but only where the parent is the parent of this edge!
		var edge = this;

		//remove every rendering of this parent -> assoc -> child
		this.parent.forNodes(function (parentNode) {
			edge.child.forNodes(function (childNode) {
				parentNode.children[edge.type.index].remove(childNode);
			});
		});

		//2. reduce the number of refs for child, remove if necessary
		this.child.free();

		//3. Remove edges from the tree cache structure
		this.tree.freeEdge(this);
	}
});

/**
 * Graphnode refers to an single instance of an object. Edges are not stored here, but globally in the tree.
 * A single graphnode might have multiple render nodes, for every time it is viewed in the tree.
 */
dojo.declare("TreeView.widget.GraphNode", null, {
	nodes : null, //correspinding render nodes
	tree : null,
	guid : null,
	type : '',
	children : null, //stores the state of child edges per type

	_data : null,
	_refs : 0, //number of parents referring to this node, if zero, free
	_burst : null,
	_subscription : null,

	constructor : function(tree, data, asRoot) {
		this.guid = data.getGuid();
		tree.dict[this.guid] = this;
		this.type = data.getEntity();
		this._data = data;

		this.tree = tree;
		this.xsettings = this.tree.getXsettings(this.type);
		this.nodes = [];

		//store childtypes
		this.children = [];

		var ar = this.getChildTypes();
		for(var i = 0; i < ar.length; i++) {
			this.children[ar[i].index] = {
				knowsChildren : false,
				type : ar[i],
				//householding for retrieving children
				_afterChildrenCb : null,
				_retrieving : false
			}
		}

		this.update(data);

		this._subscription = mx.data.subscribe({
			guid : this.guid,
			callback : dojo.hitch(this, function(thing) {
				if (dojo.isObject(thing))
					this.updateWithRefs(thing);
				else
					mx.data.get({
						guid : thing,
						error: this.tree.showError,
						callback : dojo.hitch(this, this.updateWithRefs)
					});
			})
		});

		if (asRoot == true) {
			this.tree.root = this;
			this._refs += 1; //additional ref for roots, to not accidentaly free them.
			//place the node
			var n = new TreeView.widget.RenderNode(this, null, null); //root has no assoctype associated...
		}
	},

	/** convenient helper method */
	isA : function(type) {
		return this._data.isA(type);
	},

	getSortIndex : function() {
		if (this.xsettings)
			return parseInt(this._data.get(this.xsettings.sortattr), 10);
		return -1;
	},

	updateWithRefs : function(data) {
		this.update(data);
		this.updateEdges();
	},

	update : function(data) {
		this._data = data;

		this.checkBurst();

		//redraw content data
		this.forNodes(function(node) {
			node.draw();
		});
	},

	updateEdges : function() {
		var data = this._data;
		//1. mark edges stored in here invalid
		var owningEdges = this.tree.getEdgesOwnedBy(this);

		dojo.forEach(owningEdges, function(edgeSet) {
			if (edgeSet)
				dojo.forEach(edgeSet, function(edge) {
					edge._valid = false;
				});
		});

		//2. update edges owned by this object
		for(var i = 0; i < this.tree.types.length; i++) {
			var type = this.tree.types[i];
			if (data.isA(type.ownerentity)) {

				var rawdata = data.get(type.assoc);
				var ids = this.tree.toMap(rawdata);
				var unknown = [];

				for (var id in ids) {
					var other = this.tree.dict[id];

					var isChild = type.assoctype == "fromchild";
					if (other == null) {
						//2a. handle unknown 'other side'
						if (isChild) //skip parents not available in the tree
							continue;
						else {
							unknown.push(id);
						}
					}

					if (other != null) {

						//Pre 2b: special case, if the type has a constraint and a cache burst,
						//we are not sure that the currently updated object passes the constraint, so rely on the cacheburst to show this item in that parent
						//if we are not loading exactly that relation, do not automatically create that edge
						//
						//see _retrieveChildrenCore for more about the _currentLoadingRel flag.
						var nocreate = false;
						if (type != this.tree._currentLoadingRel && isChild && type.constraint.length) {
							var xsettings = this.tree.getXsettings(type.parententity)
							if (xsettings != null && xsettings.xburstattr)
								nocreate = true;
						}

						//2b. ..find or create edge, mark valid
						var edge = this.tree.findOrCreateEdge(type, isChild ? other : this, isChild ? this : other, this, nocreate);
						if (edge)
							edge._valid = true;
					}
				}

				//3. fetch the associations from this to child which are not known yet
				this._fetchUnknownChildrenHelper(type, unknown);
			}
		}

		//4. remove invalid edges
		dojo.forEach(owningEdges, function(arr) {
			if (arr)
				for(var i = arr.length -1 ; i >= 0; i--) //MWE: count down, items might be free-ed on the fly
					if (!arr[i]._valid)
						arr[i].free();
		});
	},

	/**
	* check whethers a burst attribute, as defined in the childtypes, has changed. If so, invalidate children
	* TODO: move childeges to children
	*/
	checkBurst : function() {
		var x = this.xsettings;
		if (x != null && x.xburstattr) {
			var newburst = this._data.get(x.xburstattr);
			if  (newburst != this._burst) {
				this._burst = newburst;
				dojo.forEach(this.children, function(edgeSet) {
					if (edgeSet)
						edgeSet.knowsChildren = false;
				});

				this.forNodes(function(node) {
					if (node.collapsed == false || node == this.tree.getSelection()) { //re-draw / fetch expanded nodes

						//re-expand all assocs in the node
						dojo.forEach(node.children, function(re) {
							if (re && re.collapsed == false) {
								re.collapsed = true;
								re.setCollapsed(false, function() {
									node.tree.processRecordSelectionSuggestion();
								});
							}
						});
					}
				});
			}
		}
	},

	forNodes : function(func) {
		var l = this.nodes.length;
		for (var i = 0; i < l; i++)
			func.call(this, this.nodes[i]);
	},

	/**
	 * returns all types which can be a child of this node (independent of owner)
	 * @return {[type]}
	 */
	getChildTypes : function() {
		var res = [];
		for(var i = 0; i < this.tree.types.length; i++)	{
			var type = this.tree.types[i];

			if (this.isA(type.parententity))
				res.push(type);
		}
		return res;
	},

	//if a ref(set) was changed, and it refers to unknown ids, fetch them.
	_fetchUnknownChildrenHelper : function(type, guids) {
		if (guids.length == 0) //no guids
			return;
		if ( !this.children[type.index].knowsChildren) //never expanded, we need to fetch anyway on the next expand, and the edges will be created by the retrieve. Skip for now
			return;

		var args = {
			xpath : xpath,
			filter : type.filter,
			callback : dojo.hitch(this, function(data) {
				this.tree.processData(data); //data should always be one (or zero if not in constraint)

				for(var i = 0; i < data.length; i++) { //create the assocations
					var e = this.tree.findOrCreateEdge(type, this, this.tree.dict[data[i].getGuid()], this);
					e._valid = true;
				}
			}),
			error: this.tree.showError
		}

		//Question: should the constraint be applied?
		//- Yes: that is more consistent.
		//- No: allows for unsaved objects to be shown in the tree if added to the parent
		//Current implementation: yes if a constraint is used, otherwise, guids is used

		if (type.constraint) {
			var xpath = "//" + type.entity + "[id='" + guids.join("' or id='").substring(5) + "']" + type.constraint;
			args.xpath = xpath.replace(/\[\%CurrentObject\%\]/gi, this.tree.root.guid);
		}
		else {
			args.guids = guids;
		}

		mx.data.get(args);
	},

	ensureChildren : function(type, callback) {
		var c = this.children[type.index];
		if (c.knowsChildren)
			callback && callback();

		else if (c._retrieving)
			callback && c._afterChildrenCb.push(callback);

		else {
			c._retrieving = true;
			c._afterChildrenCb = callback ? [callback] : []; //event chain

			this._retrieveChildrenCore(c, dojo.hitch(this, function() {
				c._retrieving = false;
				c.knowsChildren = true;

				var f;
				while(f = c._afterChildrenCb.shift())
					f();
			}));
		}
	},

	_retrieveChildrenCore : function(c, callback) {
		var type = c.type;

		//self references leaving from the parent need a recursive constraint
		var reverse = type.recursive && type.assoctype == 'fromparent' ? '[reversed()]' : '';
		var xpath = "//" + type.entity + "[" + type.assoc + reverse + " = '" + this.guid + "']" + type.constraint;
		xpath = xpath.replace(/\[\%CurrentObject\%\]/gi, this.tree.root.guid);

		var kwargs = {
			xpath : xpath,
			filter : this.tree.getXsettings(type.entity).filter,
			callback : dojo.hitch(this, function(rel, data) {

				//1. mark edges from here in here invalid
				var edges = this.tree.getChildEdges(this)[rel.index];
				for(var childguid in edges)
					edges[childguid]._valid = false;

				try {
					//if a cacheburst is used, child to parent edgets are not created automatically to avoid byposing constraints.
					//however, here, we now that the constraint is allowed to be bypassed since we are loading exactly that relation
					//store this in flag.
					this.tree._currentLoadingRel = rel;
					this.tree.processData(data);
				}
				finally {
					delete this._currentLoadingRel;
				}

				//3. create the edge if from parent, update index, update valid state
				for(var i = 0; i < data.length; i++) {
					var guid = data[i].getGuid();
					var child = this.tree.dict[guid];

					var edge =
						type.assoctype == 'fromparent'
						//3a. if this object is the owner of the association, the edges are not created automatically by process data, create them now
						? this.tree.findOrCreateEdge(type, this, child, this)
						//3b. otherise, still retrieve the edge to update the index if necessary
						: this.tree.findOrCreateEdge(type, this, child, child);

					edge.updateIndex(i);

					//we now for sure it is valid now
					edge._valid = true;
				}

				//4. remove invalid children after receiving all data (no need to refetch them)
				for(var childguid2 in edges)
					if (!edges[childguid2]._valid)
						edges[childguid2].free();

				callback(); //wait with callback until all requests are completed
			}, type),
			error: this.tree.showError
		};

		var xsettings = this.tree.getXsettings(type.entity);

		if (!kwargs.filter)
			kwargs.filter = {};

		if (xsettings != null)
			kwargs.filter.sort = [[ xsettings.sortattr, xsettings.sortdir ]];

		//perform the get
		mx.data.get(kwargs);
	},


	free : function() {
		this._refs -= 1;

		if (this._refs <= 0) {
			if (this._destroyed)
				return;
			this._destroyed = true;

			if (this._subscription)
				mx.data.unsubscribe(this._subscription);

			delete this.tree.dict[this.guid];

			this.forNodes(function(node) {
				node.free();
			})

			//Question: which edges should be freed here?
			//Answer: only the owning ones. Non owning ones should be freed as a result of refreshes of their objects
			var owningEdges = this.tree.getEdgesOwnedBy(this);
			dojo.forEach(owningEdges, function(ar) {
				if (ar)
					for(var i = ar.length -1; i >= 0; i--)
						ar[i].free();
			});

			delete this.tree.edgesByParent[this.guid];
			delete this.tree.edgesByOwner[this.guid];
		}
	}
});


/**
 * Rendering of a group of children
 */
dojo.declare("TreeView.widget.RenderEdge", null, {
	parent : null, //rendernode
	type : null, //assoc type definition
	domNode : null,
	tree : null,
	children : null, //array with children
	childNode : null, //ul with the children
	collapsed : null,
	isEdge : true,
	visible : false,

	constructor : function(parentRenderNode, type) {
		this.parent = parentRenderNode;
		this.type = type;
		this.tree = this.parent.tree;
		this.children = [];

		var childNode = this.childNode = mxui.dom.ul({'class' : 'gg_assoc_children gg_assoc_' + type.assoc.replace(".","_")});
		var wrapperNode = this.domNode = mxui.dom.li({'class' : 'gg_assoc_wrapper ' + type.assocclazz});

		this.visible = type.showassocname;
		if (this.visible) {
			var fold = this.foldNode = mxui.dom.span({});
			var caption = mxui.dom.span({'class' : 'gg_assoc_title gg_assoc_' + type.assoc.replace(".","_")}, type.assoccaption);
			var div = new mxui.dom.div({'class' : 'gg_row', 'style' : type.assocstyle }, fold, caption);
			dojo.place(div, wrapperNode);

			dojo.addClass(childNode, 'gg_assoc_wrapped');
			dojo.addClass(wrapperNode, 'gg_node'); //only identify as node if a wrappernode is available

			mxui.dom.data(wrapperNode, 'ggdata', this);
		}

		this.setCollapsed(true);

		dojo.place(childNode, wrapperNode);
		dojo.place(wrapperNode, this.parent.childNode);

		if (this.tree.expandall > this.parent.depth)
			this.setCollapsed(false);
	},

	isA : function(type) {
		return false; //assoc node is never a type
	},

	getChildCount : function() {
		return this.children.length;
	},

	add : function(renderNode) {
		var guid = renderNode.graphNode.guid;
		this.children.push(renderNode);
		this.childNode.appendChild(renderNode.domNode);

		this.updateFoldVisibility();
	},

	remove : function(renderNode) {
		var baseidx = dojo.indexOf(this.children, renderNode);
		if (baseidx > -1) {
			this.children.splice(baseidx, 1);
			if (renderNode.domNode)
				dojo.destroy(renderNode.domNode);
		}

		this.updateFoldVisibility();
	},

	move : function(renderNode, newindex) {
		var baseidx = dojo.indexOf(this.children, renderNode);
		if (baseidx != -1 && baseidx != newindex) {
			this.children.splice(baseidx,  1);
			this.children.splice(newindex, 0, renderNode);
			this.tree.moveNode(renderNode.domNode, newindex);
		}
	},

	placeChildren : function() {
		var edges = this.tree.getChildEdges(this.parent.graphNode)[this.type.index];
		for(var childguid in edges) {
			var found = false;
			for(var i = 0; i < this.children.length; i++)
				if (this.children[i].graphNode.guid == childguid) {
					found = true;
					break;
				}

			if (!found)
				new TreeView.widget.RenderNode(this.tree.dict[childguid], this.parent, this.type);
		}
	},

	setCollapsed : function(collapsed, cb) {
		if (this.collapsed !== collapsed) {
			this.collapsed = collapsed;

			//collapse
			if (collapsed) {
				dojo.style(this.childNode, 'display', 'none');
				if (this.foldNode) //if wrapper node not visible, there is no foldnode..
					dojo.attr(this.foldNode, 'class', 'gg_assocfold gg_fold gg_folded');
				cb && cb();
			}

			//expand
			else {
				dojo.style(this.childNode, 'display', 'block');
				if (this.foldNode) //if wrapper node not visible, there is no foldnode..
					dojo.attr(this.foldNode, 'class', 'gg_assocfold gg_fold gg_loading');

				this.parent.graphNode.ensureChildren(this.type, dojo.hitch(this, function() {
					if (!this.collapsed) { //user might have clicked collapse again
						dojo.style(this.childNode, 'display', 'block');
						if (this.foldNode) //if wrapper node not visible, there is no foldnode..
							dojo.attr(this.foldNode, 'class', 'gg_assocfold gg_fold gg_unfolded');
					}


					//place the children (might not be done automatically if we were expanding an already loaded item)
					this.placeChildren();

					this.updateFoldVisibility();

					cb && cb();
				}));
			}

		}
		else
			cb && cb();
	},

	updateFoldVisibility : function() {
		if (this.foldNode) {
			if (this.children.length == 0)
				dojo.style(this.foldNode, 'visibility', 'hidden');
			else
				dojo.style(this.foldNode, 'visibility', '');
		}
		this.parent.updateFoldVisibility();
	},

	getVisibleParent : function() {
		return this.parent;
	},

	free : function() {
		if (this._destroyed)
			return;
		this._destroyed = true;

		for(var i = this.children.length - 1; i >= 0; i--)
			this.children[i].free();

		if (this.domNode)
			dojo.destroy(this.domNode);
	}
});

//A Node in the rendering
dojo.declare("TreeView.widget.RenderNode", null, {
	graphNode : null, //correspoding graphnode
	children : null, //list of renderEdges
	domNode : null,
	rowNode : null,
	dataNode : null, //rendered node
	childNode : null, //node to place children in
	parent : null, //rendernode
	type : null, //the assoc for which this item was rendered
	tree : null,
	depth : 0,
	collapsed : null,
	index : -1,
	_colNodes : null, //array with columnNodes
	canHazChildren : true,
	isEdge : false,
	hasVisibleEdge : false, //true if there is an always visible association edge.

	constructor : function(graphNode, parentRenderNode, type) {
		this.graphNode = graphNode;
		this.parent = parentRenderNode;
		this.isRoot = this.parent == null;
		this.children = [];
		this.type = type;
		this.tree = graphNode.tree;

		this.canHazChildren = this.graphNode.getChildTypes().length > 0;

		this.foldNode = mxui.dom.span({'class': 'gg_nodefold gg_fold ' + (this.canHazChildren ? 'gg_folded' : 'gg_nofold')});
		this.dataNode = mxui.dom.span({'class': 'gg_data', 'style' : this.graphNode.xsettings.entitystyle });
		this.childNode = mxui.dom.ul({'class': 'gg_children'});
		this.rowNode = mxui.dom.div({'class' : 'gg_row' }, this.foldNode, this.dataNode);
		this.domNode = mxui.dom.li({'class':'gg_node ' + this.graphNode.xsettings.entityclazz }, this.rowNode, this.childNode);

		mxui.dom.data(this.domNode, "ggdata", this);

		if (this.graphNode.getChildTypes().length > 0)
			dojo.addClass(this.domNode, 'gg_canhazchildren');

		this.setupColumns();

		this.draw(true);

		this.setCollapsed(true);


		//setup child edges
		dojo.forEach(this.graphNode.getChildTypes(), function(type) {
			this.children[type.index] = new TreeView.widget.RenderEdge(this, type);
			this.hasVisibleEdge |= type.showassocname;
		}, this);

		//root item
		if (this.parent == null) {
			dojo.place(this.domNode, this.tree.treeNode);
		}
		//place in parent
		else {
			this.depth = this.parent.depth + 1;
			this.getEdge().add(this);
		}

		graphNode.nodes.push(this);

		if (this.tree.expandall > this.depth)
			this.setCollapsed(false);
		else if (this.tree.prefetch == true) {
			dojo.forEach(this.graphNode.getChildTypes(), function(type) {
				if (!graphNode.children[type.index].knowsChildren)
					graphNode.ensureChildren(type, dojo.hitch(this, function() {
						this.children[type.index].placeChildren();
						this.children[type.index].updateFoldVisibility();
					}));
			}, this);
		}

	},

	data : function() {
		return this.graphNode._data;
	},

	getVisibleParent : function() {
		if (this.parent == null)
			return null;

		var e = this.getEdge();
		if (e.visible)
			return e;
		return this.parent;
	},

	getEdge : function() {
		return this.parent.children[this.type.index];
	},

	/** convenient helper method */
	isA : function(type) {
		return this.graphNode.isA(type);
	},

	getChildCount : function() {
		var res = 0;
		dojo.forEach(this.children, function(edge) {
			if (edge)
				res += edge.children.length;
		});
		return res;
	},

	updateFoldVisibility : function() {
		if (this.foldNode) {
			if (!this.hasVisibleEdge && this.getChildCount() == 0)
				dojo.style(this.foldNode, 'visibility', 'hidden');
			else
				dojo.style(this.foldNode, 'visibility', '');
		}
	},

	findMaxIndex : function() {
		var max = -100000;
		dojo.forEach(this.children, function(edge) {
			if (edge)
				for(var j = 0, c = null; c = edge.children[j++];)
					max = Math.max(max, c.graphNode.getSortIndex());
		});
		return max;
	},

	findMinIndex : function() {
		var min = 100000;
		dojo.forEach(this.children, function(edge) {
			if (edge)
				for(var j = 0, c = null; c = edge.children[j++];)
					min = Math.min(min, c.graphNode.getSortIndex());
		});
		return min;
	},

	setCollapsed : function(newvalue, cb) {
		if (newvalue == this.collapsed) {
			cb && cb();
			return;
		}

		this.collapsed = newvalue;
		if (this.collapsed) {
			dojo.style(this.childNode, 'display', 'none'); //TODO: anim
			dojo.attr(this.foldNode, 'class', 'gg_nodefold gg_fold ' + (this.canHazChildren ? 'gg_folded' : 'gg_nofold'));
			cb && cb();
		}
		else {
			dojo.attr(this.foldNode, 'class', 'gg_nodefold gg_fold gg_loading');

			var allChildrenCallback = dojo.hitch(this, function() {
				if (!this.collapsed) { //user might have clicked collapse again
					dojo.style(this.childNode, 'display', 'block'); //TODO: anim
					dojo.attr(this.foldNode, 'class', 'gg_nodefold gg_fold ' + (this.canHazChildren ? 'gg_unfolded' : 'gg_nofold'));
				}

				this.updateFoldVisibility();

				cb && cb();
			});

			var left = 0;
			var self = this;

			dojo.forEach(this.children, function(re) {
				if (re && !re.visible) { //collapse if no wrapper node available
					left += 1;
					re.setCollapsed(false, dojo.hitch(self, function() {
						left-=1;
						if (left == 0) {
							allChildrenCallback();
							left = -1; //make sure callback is not fired twice if setCollapsed is executed synchronously...
						}
					}));
				}
			});
			if (left == 0)
				allChildrenCallback();
		}
	},

	setupColumns : function() {
		this._colNodes = [];

		for(var i = 0, col= null; col = this.tree.columns[i]; i++) {
			if (col.appliesTo(this)) {
				var span = mxui.dom.span({'class' : 'gg_column gg_column_' + i});
				this._colNodes.push(span);
				this.dataNode.appendChild(mxui.dom.span({ 'class' : 'gg_column_wrapper' }, span)); //wrapper column for hovers and such

				col.setupNode(span);
			}
		}
	},

	draw : function(firstTime) {
		var curCol = 0;
		for(var i = 0, col = null; col = this.tree.columns[i]; i++)
			if (col.appliesTo(this)) {
				col.render(this, this._colNodes[curCol],firstTime);
				curCol += 1;
			}
	},

	free : function() {
		if (this._destroyed)
			return;
		this._destroyed = true;

		if (this.tree.getSelection() == this)
			this.tree.setSelection(this.parent ? this.parent : null);

		dojo.forEach(this.children, function(edge) {
			if (edge)
				edge.free();
		});

		if (this.parent)
			this.getEdge().remove(this); //this will destroy the domNode as well
		else if (this.domNode)
			dojo.destroy(this.domNode);
	}
});


mxui.widget.declare("TreeView.widget.TreeView", {
	root : null, //render node
	dict : null, //guid -> GraphNode
	types : null, //type definitions : entityName -> config
	useDnd : false,

	edgesByParent : null, //parentguid.associndex.childguid
	edgesByOwner : null, //ownerguid.associndex.[idx]
	_selection : null,
	dnd :  null, //dnd state
	_hoveredRow :  null,
	_hoveredCol :  null,
	selectionrefs 	: null,
	_parent			: null,

	getContextGUID : function() {
		return this.root._data.getGuid();
	},

	getContextObject : function() {
		return this.root._data;
	},

	setSelection : function(renderNode) {
		if (renderNode != this._selection) {
			if (!this._parent && renderNode)
				this._parent = renderNode.parent;

			if (this._selection && this._parent != this._selection){
				this.testreferences(this._selection);
			}

			//remove old styling
			if (this._selection && this._selection.domNode)
				dojo.removeClass(this._selection.domNode, 'gg_selected');

			//set new selection and styling
			this._selection = renderNode;
			if (renderNode) {
				dojo.addClass(this._selection.domNode, 'gg_selected');
				dojo.window.scrollIntoView(renderNode.domNode);
			}

			this.saveAndFireSelection(renderNode);

			//update actions
			dojo.forEach(this.actions, function(action) {
				action.updateToSelection();
			});

			//fire the on select event
			this.onSelect(renderNode);
		}
	},


	testreferences : function(node) {
		if (this.selectionrefs) {
			for(i = 0; i < this.selectionrefs.length; i++) {
				if(this.selectionrefs[i].indexOf(node.graphNode.type) > -1 && this.selectionrefs[i].indexOf('/') == -1) {
					TreeView.widget.Commons.store(this.getContextObject(), this.selectionrefs[i], node && node.graphNode.guid);
				} else if (this.selectionrefs[i].indexOf('/') > -1) {
					var patharr = this.selectionrefs[i].split('/');
					var refentity = patharr[patharr.length - 1];
					if (refentity.indexOf(node.graphNode.type) > -1) {
						TreeView.widget.Commons.store(this.getContextObject(), this.selectionrefs[i], node && node.graphNode.guid);
					}
				}
			}
		}
	},

	saveAndFireSelection : function(item) {
		mx.data.save({
			mxobj : this.getContextObject(),
			callback : dojo.hitch(this, this.onSelect, item),
			error : this.showError
		}, this);

		mx.data.objectUpdateNotification(this.getContextObject());

		this.onSelect(item);
	},

	getSelection : function(allowEdge) {
		if (this._selection && this._selection.isEdge && !allowEdge)
			return this._selection.parent;
		return this._selection;
	},

	hasSelection : function() {
		return this.getSelection(false) != null;
	},

	hasMultiSelection : function() {
		return false;
	},

	withSelection : function(scope,cb) {
		if (this.hasSelection())
			cb.call(scope, this.getSelection(false));
	},

	onSelect : function(selection) {
		//stub method to connect events to
	},

	onDefaultAction : function(selection) {
		//stub, this method is invoked when a row is doubleclicked/ return is pressed
	},

	findOrCreateEdge : function(type, parent, child, owner, nocreate) {
		if (!child)
			throw this.id + "  assertion failed: no child to find or create edge provided. Has it been free-ed somehow?";

		if (!(parent.guid in this.edgesByParent))
			this.edgesByParent[parent.guid] = [];
		if (!this.edgesByParent[parent.guid][type.index])
			this.edgesByParent[parent.guid][type.index] = {};

		var place = this.edgesByParent[parent.guid][type.index]

		if (child.guid in place)
			return place[child.guid];
		else if (nocreate === true)
			return null;
		else {
			var edge = new TreeView.widget.Edge(type, parent, child, owner);

			//update edgesByParent
			this.edgesByParent[parent.guid][type.index][child.guid] = edge;

			//update edgesByOwner
			if (!(owner.guid in this.edgesByOwner))
				this.edgesByOwner[owner.guid] = [];
			if (!this.edgesByOwner[owner.guid][type.index])
				this.edgesByOwner[owner.guid][type.index] = [];

			this.edgesByOwner[owner.guid][type.index].push(edge);

			return edge;
		}
	},

	freeEdge : function(edge) {
		//update edgesByParent
		if (edge.parent.guid in this.edgesByParent) {
			delete this.edgesByParent[edge.parent.guid][edge.type.index][edge.child.guid];
		}

		//update edgesByOwner
		if (edge.owner.guid in this.edgesByOwner) {
			var idx = dojo.indexOf(this.edgesByOwner[edge.owner.guid][edge.type.index], edge);
			this.edgesByOwner[edge.owner.guid][edge.type.index].splice(idx, 1);
		}
	},

	getXsettings : function (entity) {
		var meta = mx.meta.getEntity(entity);
		for(var i = 0, x = null; x = this.xsettings[i]; i++) {
			if (meta.isA(x.xentity))
				return x;
		}
		return this.configError("TreeView config error: No Entity settings found for type: " + entity);
	},

	getEdgesOwnedBy : function(owner) {
		if (!(owner.guid in this.edgesByOwner)) //might not be available yet
			this.edgesByOwner[owner.guid] = [];

		return this.edgesByOwner[owner.guid];
	},

	getChildEdges : function(parent) {
		if (!(parent.guid in this.edgesByParent))
			this.edgesByParent[parent.guid] = [];

		return this.edgesByParent[parent.guid];
	},


	/* context applied */
	update : function(data, cb) {
		var guid = data.getGuid();
		if (this.root != null && this.root.guid == guid) //already the root, just refresh
			this.processData([data]);
		else {
			if (!this.getXsettings(data.getEntity()))
				this.configError("The context of this widget is a '" + data.getEntity() + ", but this type is not further defined in the entities property of the treeview");

			if (this.root)
				this.root.free();

			this.dict[guid] = new TreeView.widget.GraphNode(this, data, true);
			this.root.forNodes(function(node) {
				node.draw();

				//unfold roots by default (note, should be one)
				node.setCollapsed(false);
			});

			this.selectFirstItem();
		}

		cb && cb();
	},

	selectFirstItem : function() {
		if (!this.hiderootnode) {
			if  (this.root && this.root.nodes.length > 0)
				this.setSelection(this.root.nodes[0]);
		}
		//select first child
		else {
			var edges = this.root.getChildTypes();
			if (edges.length > 0) {
				var edge = edges[0];
				this.root.ensureChildren(edge, dojo.hitch(this, function() {
					var firstRefChildren = this.root.nodes[0].children[edge.index].children;
					if (firstRefChildren.length > 0)
						this.setSelection(firstRefChildren[0]);
				}));
			}
		}
	},

	processData : function(data) {
		for(var i = 0; i < data.length; i++) {
			var mxobj = data[i];
			var guid = mxobj.getGuid();
			if (this.dict[guid])
				this.dict[guid].update(mxobj);
			else {
				var g = new TreeView.widget.GraphNode(this, mxobj, false);
				if (this._recordSelectionSuggestion) {
					if (!this._selectionSuggestions)
						this._selectionSuggestions = [g];
					else
						this._selectionSuggestions.push(g);
				}
			}
			//TODO: pass index along to the appropriate edges...
		}
	},

	processRecordSelectionSuggestion : function() {
		var max = 0,
			cur = null;
		if (this._selectionSuggestions) {
			//find the newest item from the suggestions
			for(var i = 0, g = null; g = this._selectionSuggestions[i++];) {
				var b = g._data.get("changedDate");
				if (b > max) {
					max = b;
					cur = g;
				}
			}

			//expand it
			if (cur) {
				var self = this;
				cur.forNodes(function(node) {
					if (node.parent == self.getSelection()) {
						//expand parent first
						node.parent.setCollapsed(false, function() {
							//expand wrapper if needed
							node.getEdge().setCollapsed(false);
							self.setSelection(node);
						});
					}
				})
			}
		}
		delete this._selectionSuggestions;
		delete this._recordSelectionSuggestion;
	},

	/*


	UI Events


	*/

	grabFocus : function() {
		if (mxui.wm.focus.get() != this.treeNode)
			mxui.wm.focus.put(this.treeNode);
	},

	setupEvents : function() {
		var lc = TreeView.widget.Commons.liveConnect;

		lc(this, this.treeNode, "onclick", {
			"gg_assocfold" : this.assocFoldClick,
			"gg_nodefold"  : this.foldNodeClick,
			"gg_column_wrapper" : this.columnClick,
			"gg_node" : function(node, e) {
				this.grabFocus();

				this.setSelection (mxui.dom.data(node, "ggdata"));

				//expand if a row is clicked somewhere (but avoid folding twice if foldnode is clicked)
				if (this.expandmode == 'row' && !dojo.hasClass(e.target, 'gg_nodefold'))
					this.foldNodeClick(node);
			}
		});

		lc(this, this.treeNode, "ondblclick", {
			"gg_node" : function(target, e) {
				if (!(dojo.hasClass(e.target, 'gg_fold'))) //do not handle doubleclicks on fold nodes //TODO:nor clickables?
					this.invokeDefaultAction(target, e);
			}
		});

		lc(this, this.treeNode, "onmouseover", {
			"gg_column_wrapper" : function(target, e) {
				if (!this.dnd.isdragging && target != this._hoveredCol) {
					this.hoveredCol && dojo.removeClass(this.hoveredCol, 'gg_col_hover');
					dojo.addClass(target, 'gg_col_hover');
					this.hoveredCol = target;
				}
				return true;
			},
			"gg_fold" : function(target, e) {
				dojo.addClass(target.parentNode, 'gg_fold_hover');
				return true;
			},
			"gg_node" : this.onRowMouseOver,
			"gg_children" : function(_, e) {
				//if (this.dnd.isdragging)
				dojo.stopEvent(e);
				return false; //avoid bubbling if dragging between items;
			}
		});

		lc(this, this.treeNode, "onmouseout", {
			"gg_fold" : function(target, e) {
				dojo.removeClass(target.parentNode, 'gg_fold_hover');
				return true;
			}
		});

		lc(this, this.treeNode, "onmousedown", {
			"gg_node" : this.onRowMouseDown
		});

		lc(this, this.treeNode, "onmouseup", {
			"gg_node" : this.onRowMouseUp
		});

		this.connect(this.treeNode, "onkeypress", this.keypress);

		if (this.expandmode == 'accordion')
			dojo.connect(this, 'onSelect', this.updateAccordionForSelection);
	},

	_getRenderNodeForNode : function(node) {
		while(node != null) {
			if (dojo.hasClass(node, 'gg_node')) {
				if (node == this.dnd.tmpnode)
					return this.dnd.target;
				return mxui.dom.data(node, "ggdata");
			}
			node = node.parentNode;
		}

		return null;
	},

	keypress : function(e) {
		var sel = this.getSelection(true);
		if (sel) {
			var handled = true;
	        switch (e.keyCode) {
	            case dojo.keys.ENTER:
	                this.invokeDefaultAction();
	                break;
	            case dojo.keys.DOWN_ARROW :
                    if (e.ctrlKey == true) {
                    	//TODO: swap
                    }
                    else {
                    	//next one is a child
                    	var fc = this._getRenderNodeForNode(this.findNextNode(sel.domNode, 'gg_node', this.treeNode));

                    	if (fc != null)
                    		this.setSelection(fc);
                    }
	                break;
	            case dojo.keys.UP_ARROW :
                    if (e.ctrlKey == true) {
                    	//TODO: swap
                    }
                    else {
                    	var prev = this._getRenderNodeForNode(this.findPreviousNode(sel.domNode, 'gg_node', this.treeNode));
                    	if (prev)
                			this.setSelection(prev);
                    }
	                break;
	            case dojo.keys.LEFT_ARROW:
	                if (e.ctrlKey == false) {
	                	if (!sel.collapsed)
	                		sel.setCollapsed(true);
	                	else if (sel.getVisibleParent())
	                		this.setSelection(sel.getVisibleParent());
	                }
	                else
	                    this.itemIndent(this.getSelection(), true); //TODO:
	                break;
	            case dojo.keys.RIGHT_ARROW:
	                if (e.ctrlKey == false) {
	                	if (sel.collapsed)
	                		sel.setCollapsed(false);
	                	else {
		                	var fs = this._getRenderNodeForNode(this.findNextNode(sel.domNode, 'gg_node', this.treeNode));
		                	if (fs)
		                		this.setSelection(fs);
		                }
	               	}
	                else
	                    this.itemIndent(this.getSelection(), false); //TODO:
	                break;
	            default :
	                if (e.charCode == dojo.keys.SPACE) {
                    	sel.setCollapsed(!sel.collapsed);
	                }
	                else {
	                    handled = false;
	                }
	                break;
	        }
	    }
        if (handled)
            dojo.stopEvent(e);
	},

	invokeDefaultAction : function() {
		for(var i = 0, a = null; a = this.actions[i++];)
			if (a.actisdefault && a.appliesToSelection())
				a.invokeOnSelection();
	},

	onRowMouseOver : function(target, e) {
//		console.log("over");
		if (!this.dnd.isdragging && target != this._hoveredRow) {
			this._hoveredRow && dojo.removeClass(this._hoveredRow, 'gg_row_hover');
			dojo.addClass(target, 'gg_row_hover');
			this._hoveredRow = target;
		}

		if (!this.dnd.isdragging && this.useDnd && this.dnd.mousedown) {
			if (this.dnd.startNode == target
				&& (Math.abs(e.pageX - this.dnd.startX) > 1 //NaN > 5 === false, so thats ok
				|| Math.abs(e.pageY - this.dnd.startY) > 1
			)) {
				this.startDrag(target, e);
			}
		}

		else if (this.dnd.isdragging) {
			this.onDrag(target, e);
		}
		e.preventDefault();
		dojo.stopEvent(e);
		return false; //stop further events
	},

	onRowMouseDown : function(target, e) {
//		console.log("on down");
		if (!this.dnd.isdragging) {
			this.dnd.mousedown = true;
			this.dnd.startNode = target;
			this.dnd.startX = e.pageX;
			this.dnd.startY = e.pageY;
		}
		e.preventDefault();
		return false;
	},

	onRowMouseUp : function(target, e) {
//		console.log("on up");
		this.dnd.mousedown = false;
		if (this.dnd.isdragging) {
			this.onEndDrag(target, e);
		}
		return false;
	},

	resetDndClasses : function(node) {
		if (node)
			dojo.removeClass(node, 'gg_drag_over gg_drag_accept gg_drag_deny');
	},

	startDrag : function(target, e) {
		//tmp node for drag an drop operations
		this.dnd.tmpnode = mxui.dom.li({'class' : 'gg_node gg_anchor'}, mxui.dom.div({'class' : 'gg_anchor_inner'}));

		var current = this.dnd.current = this._getRenderNodeForNode(target);
		this.setSelection(current);

		//if this item does not support DnD, go on as usual
		if (current.isEdge || current.isRoot || !current.type.allowdnd)
			return false;

		var avatar =  this.dnd.avatar  = mxui.dom.div({'class' : 'gg_avatar'}, dojo.clone(current.rowNode)); //TODO: make beter avatar

		//hooray, we can start thedrag
//		console.log("start drag");

		this.dnd.isdragging = true;
		this.dnd.beginBox = dojo.position(target);

		dojo.addClass(current.domNode, 'gg_dragging');

		dojo.addClass(avatar, 'gg_avatar');
		dojo.place(avatar, dojo.body(), 'last');

		//update position
		dojo.style(avatar, {
			'position' : 'absolute',
			'zIndex' : 10000
		});

		this.dnd.bodyconnect = dojo.connect(dojo.body(), "onmouseup", dojo.hitch(this, function() {
			this.onEndDrag();
		}))

		this.dnd.bodyconnect2 = dojo.connect(dojo.body(), "onmouseover", dojo.hitch(this, function(e) {
			//console.log("mouse out");
			dojo.style(this.dnd.avatar, {
				'top' : (e.pageY + 32) + 'px',
				'left' : (e.pageX + 32) + 'px'
			});

			if (this.dnd.target)
				this.resetDndClasses(this.dnd.target.domNode);

			this.dnd.accept = false;
			this.dnd.target = null;

			dojo.addClass(this.dnd.avatar, 'gg_drag_outside');
		}));

                return true;
	},

	onDrag : function(targetNode, e) {
		//Hide selection, especially needed in IE.
		if(document.selection && document.selection.empty) {
			document.selection.empty();
		} else if(window.getSelection) {
			var sel = window.getSelection();
			sel.removeAllRanges();
		}

		var prevtarget = this.dnd.target;
		var prevbefore = this.dnd.dropbefore;

		if (prevtarget)
			this.resetDndClasses(prevtarget.domNode);

		var current       = this.dnd.current;
		var avatar        = this.dnd.avatar;
		var mbox 		  = dojo.marginBox(targetNode.children[0]); //take the first child, as the node itself might include the descendants
		var	target        = this.dnd.target     = this._getRenderNodeForNode(targetNode);

		if (!target)
			return;

		var candropBefore                       = this.canDropBefore(current, target);
		var pos;
		var tmpnode       = this.dnd.tmpnode;
		var copy          = this.dnd.copy       = e && e.ctrlKey;

		var oy = e.offsetY || e.layerY; //for FF compatiblity

		//drag over tmpnode
		if (targetNode == tmpnode) {
			pos = this.dnd.pos = this.dnd.tmppos;
		}
		//drag over a real node
		else {
			pos = this.dnd.pos = 'last';
			if (candropBefore) {
				if (oy > mbox.h / 2) {
					if (target.collapsed == true || target.childNode.children.length == 0) {
						this.dnd.tmppos = 'after';
						dojo.place(tmpnode, target.domNode, 'after');
					}
					else {
						//as first child
						this.dnd.tmppos = 'first';
						dojo.place(tmpnode, target.childNode, 'first');
					}
				}
				else {
					this.dnd.tmppos = 'before';
					dojo.place(tmpnode, target.domNode, 'before');
				}
			}
		}

		var accept        = this.dnd.accept     = this.dragOver(current, target, pos, copy);

//		console.log("DnD over: pos: " + pos + " candropBefore: " + candropBefore + " copy: " + copy + " accept: " + accept + " tmppos: " + this.dnd.tmppos + " rowh: " + mbox.h + " y: " + oy);
		this.resetDndClasses(target.domNode);
		this.resetDndClasses(tmpnode);
		dojo.removeClass(avatar, 'gg_drag_outside');

		//update classes according to state
		if (copy)
			dojo.addClass(avatar, 'gg_drag_copy');
		else
			dojo.removeClass(avatar, 'gg_drag_copy');

		if (pos == 'last') {
			dojo.addClass(target.domNode, 'gg_drag_over');
			dojo.addClass(target.domNode, accept? 'gg_drag_accept' : 'gg_drag_deny');
		}
		else {
			dojo.addClass(tmpnode, 'gg_drag_over gg_drag_accept');
		}

		var acceptTmp = candropBefore && (pos != 'last' || this.dragOver(current, target, this.dnd.tmppos, copy)); //is the tmppos allowed?
		dojo.style(tmpnode, 'display', acceptTmp ? 'list-item' :  'none');

		dojo.style(avatar, {
			'top'  : (e.pageY + 32) + 'px',
			'left' : (e.pageX + 32) + 'px'
		});

		//stop / start the expand timer
		//auto expand stuff
		if (prevtarget != target || pos != 'last') {
			if (this.dnd.expandtimer) {
				clearTimeout(this.dnd.expandtimer);
				this.dnd.expandtimer = null;
			}
		}
		else if (pos == 'last')
			if (!this.dnd.expandtimer) {
				this.dnd.expandtimer = setTimeout(dojo.hitch(this, function(toexpand) {
					if (toexpand == this.dnd.target && this.dnd.pos == 'last') { //still the same ?
						toexpand.setCollapsed(false);
						//if (this.dnd.tmpnode)
						//	this.dnd.tmpnode.parentNode = null; //hide current tmpnode, mwe: disabled for now, parentNode = null breaks in IE
					}
				}, target), 500);
			}
	},

	onEndDrag : function(target, e) {
//		console.log("stop drag");

		//MWE: e is null in the case of the body mouseup
		//if (e)
		//	this.onDrag(target, e); //make sure everything is up to date
		var result = this.dnd.accept && this.performDrop(this.dnd.current, this.dnd.target, this.dnd.pos, this.dnd.copy);

		//update event state
		this.dnd.isdragging = false;
		this.dnd.mousedown =  false;
		dojo.disconnect(this.dnd.bodyconnect);
		dojo.disconnect(this.dnd.bodyconnect2);

		//hide temporary nodes node
		dojo.style(this.dnd.tmpnode, 'display', 'none');
		dojo.destroy(this.dnd.tmpnode);
		delete this.dnd.tmpnode;

		if (result) {
			this.resetNodesAfterDnD();
		}
		else { //revert, move the node back if cancelled
			dojo.animateProperty({
				node : this.dnd.avatar,
				properties : {
					left : this.dnd.beginBox.x,
					top : this.dnd.beginBox.y
				},
				duration : 500,
				onEnd : dojo.hitch(this, this.resetNodesAfterDnD)
			}).play();
		}
	},

	resetNodesAfterDnD : function() {
		if (this.dnd.target)
			this.resetDndClasses(this.dnd.target.domNode);
		this.resetDndClasses(this.dnd.current.domNode);
		dojo.removeClass(this.dnd.current.domNode, 'gg_dragging');

		dojo.destroy(this.dnd.avatar);
		delete this.dnd.avatar;
	},

	_findDropAssocs : function(item, target, pos, copy) {
		var assocs = [];

		if (pos == 'before' || pos == 'after' || target.isEdge) {
			//the drop assocation is the association of the current target item, thats easy :)
			if (!target.isRoot && target.type.allowdnd
				&& (!copy || target.type.allowdndcopy)
				&& item.isA(target.type.entity))
				assocs.push(target.type);
		}
		else {
			//return find assocition from target -> child with dnd
			for(var i = 0, a = null; a = this.types[i++];) {
				if (a.allowdnd
					&& (!copy || a.allowdndcopy)
					&& item.isA(a.entity)
					&& target.isA(a.parententity)
				) {
					assocs.push(a);
				}
			}
		}
		return assocs;
	},

	//indicate whether it is possible to drop before another item
	canDropBefore : function(item, target) {
		if (!target || target.isEdge) //we cannot drop before assoc nodes
			return false;

		var e = item.graphNode.type;
		//use a cache
		if (!this.dnd.allowDropBefore)
			this.dnd.allowDropBefore = {};
		if (!(e in this.dnd.allowDropBefore)) {
			var x = item.graphNode.xsettings;
			this.dnd.allowDropBefore[e] = x && mx.meta.getEntity(e).getAttributeType(x.sortattr) == "Float";
		}
		return this.dnd.allowDropBefore[e];
	},

	/**
	 * triggered when dragging item over target.
	 * @param  {[type]} item   [description]
	 * @param  {[type]} target [description]
	 * @param  {[type]} before [description]
	 * @return {[type]} Whether the item can be dropped here. Used for styling
	 */
	dragOver : function(item, target, pos, copy) {
		//Avoid drop in self
		//
		var validSelfdrop = (target == item && (pos == 'before' || pos == 'after'));

		if (!validSelfdrop) {
			var cur = target;
			while(cur != null) {
				if (cur == item)
					return false;
				cur = cur.parent;
			}
		}
		return this._findDropAssocs(item, target, pos, copy).length > 0;
	},

	/**
	 * Drops an item on a target. Return true if the drop was accepted / succesful
	 * The return value is used for styling purposes only (if false, a revert animation is playe).
	 * The real data should be updated as a result of callbacks
	 * @param  {[type]} item   [description]
	 * @param  {[type]} target [description]
	 * @param  {[type]} pos [description]
	 * @return {[type]}
	 */
	performDrop : function(item, target, pos, copy) {
		if (!target)
			return false;

		var assocs = this._findDropAssocs(item, target, pos, copy);
		var actions = []; //microflows to invoke to persist the changes

		var i = item.graphNode._data; //item
		var o = item.parent.graphNode._data; //old parent

		//determine drop target
		var t = null;
		if (target.isEdge)
			t = target.parent.graphNode._data;
		else if (pos == 'before' || pos == 'after')
			t = target.parent.graphNode._data
		else
			t = target.graphNode._data; //new parent

		//0) always remove existing parent if not copy, regardless which association it was..
		if (!copy) {
			var assoc1 = item.type;
			if (assoc1.assoctype == "fromparent") {
				if (assoc1.isRefset)
					o.removeReferences(assoc1.assoc, [i.getGuid()]);
				else
					o.set(assoc1.assoc, '');

				actions.push([assoc1.dropmf, o]); //otherwise o might never know that a child was removed
			}
			else { //from child
				if (assoc1.isRefset)
					i.removeReferences(assoc1.assoc, [o.getGuid()]);
				else
					i.set(assoc1.assoc, '');

				//actions.push([assoc.dropmf, i]); //MWE: I guess this is not needed, since a drop mf is most likely already fired for i, and this might confuse the logic.
			}
		}

		//1) update new parent
		for(var k = 0, assoc = null; assoc = assocs[k++];) {
			//assoc stored in parent
			if (assoc.assoctype == "fromparent") {
				actions.push([assoc.dropmf, t]);

				//reference set (was already removed from orig parent in step 0)
				if (assoc.isRefset) {
					t.addReferences(assoc.assoc, [i.getGuid()]);
				}

				//normal reference
				else
					t.set(assoc.assoc, i.getGuid());
			}

			//assoc stored in child
			else {
				actions.push([assoc.dropmf, i]);

				if (assoc.isRefset) {
					i.addReferences(assoc.assoc, [t.getGuid()]);
				}
				else
					i.set(assoc.assoc, t.getGuid()); //copy is not supported, dont bother
			}
		}

		//2) update position. Note that this position applies to all assocs! which is a bit weird...
		var x = item.graphNode.xsettings;
		if (x && mx.meta.getEntity(item.graphNode.type).getAttributeType(x.sortattr) == "Float") {
			if (pos == 'before' || pos == 'after') {
				//find the other related element for drop in between
				var othernode = pos == 'before' ? target.domNode.previousElementSibling : target.domNode.nextElementSibling;
				if (this.dnd.tmpnode != null && othernode == this.dnd.tmpnode)
					othernode = pos == 'before' ? othernode.previousElementSibling : othernode.nextElementSibling;
				var other = this._getRenderNodeForNode(othernode);

				var nidx;
				if (other == null || other.isEdge) //either first or last
					nidx = target.graphNode.getSortIndex() + (pos == 'before' ? -1024 : 32354);

				else //put between
					nidx = (target.graphNode.getSortIndex() + other.graphNode.getSortIndex()) / 2;
			}
			else {
				if (pos == 'last')
					nidx = (target.isEdge ? target.parent : target).findMaxIndex() + 14056;
				else
					nidx = (target.isEdge ? target.parent : target).findMinIndex() - 4313;
			}

			if (isNaN(nidx))
				nidx = 0; //probably div by zero

			item.graphNode._data.set(x.sortattr, nidx);
		}

		//3) loop items in actions, store the changes and invoke the microflows
		var left = actions.length;
		var gn = item.graphNode;
		//TODO: check whether ar doesn't have double items?
		for (var l = 0, ar = null; ar = actions[l++];) {
			TreeView.widget.Commons.mf(ar[0],ar[1], function() {

				//when all mf's have fired, find the best node to select
				left -= 1;
				if (left == 0 ) {
					//find the best node to animate
					var bestnode = null;
					gn.forNodes(function(node) {
						if (bestnode == null || node.parent == target || node.parent == target.parent)
							bestnode = node;
					});

					if (bestnode)
						this.setSelection(bestnode);
				}
			}, this);
		}

		return true;
	},

	foldNodeClick : function(node) {
		var renderNode = this._getRenderNodeForNode(node);
		renderNode.setCollapsed(!renderNode.collapsed);
	},

	updateAccordionForSelection : function(record) {
		if (!record)
			return;
		record.setCollapsed(false);

		var c = record;
		var p = record.getVisibleParent();
		while (p != null) {
			dojo.forEach(p.children, function(assoc) {
				if (assoc) dojo.forEach(assoc.children, function(child) {
					if (child != c)
						child.setCollapsed(true);
				});
			});
			c = p;
			p = p.getVisibleParent();
		}
	},

	assocFoldClick : function(node) {
		var renderEdge = mxui.dom.data(node.parentNode.parentNode, "ggdata");
		renderEdge.setCollapsed(!renderEdge.collapsed);
	},

	columnClick : function(node) {
		var col = mxui.dom.data(node, 'colindex');
		var renderNode = this._getRenderNodeForNode(node);

		this.columns[col].invokeAction(renderNode);
	},

	/*



	HouseHolding



	*/

	inputargs : {
		//data model properties
		tabindex : -1,
		entity : '',
		parentassocsingle : '',
		parentassocmulti : '',
		assoctype : '',
		assoccaption : '',
		showassocname :  '',
		constraint : '',
		allowdnd : '',
		allowdndcopy : '',
		dropmf : '',
		assocclazz : '',
		assocstyle : '',

		//display properties
		columnname : '',
		columnentity : '',
		columnrendermode : '',
		columnattr : '',
		columnimage : '',
		columnaction : '',
		columnclazz : '',
		columnstyle : '',
		columndateformat : '',
		columnprefix  : '',
		columnpostfix : '',
		columntruecaption  : '',
		columnfalsecaption : '',

		//action properties
		actname : '',
		actentity : '',
		actshowbutton : '',
		actautohide : '',
		actbuttoncaption : '',
		actbuttonimage : '',
		actconfirmtext : '',
		actmf : '',
		actisdefault : '',
		actonselect : '',
		actnoselectionmf : '',
		actshortcut : '',
		actprogressmsg : '',

		//Selection references
		selectionref: '',

		//advanced settings
		xentity : '',
		xburstattr: '',
		xlisteningform: '',
		sortattr : '',
		sortdir : '',
		entityclazz : '',
		entitystyle : '',
		entitychannel : '',
		allowmultiselect: false,
		selectionrefset: '',

		//general properties
		expandall : 1,
		prefetch : true,
		hiderootnode : true,
		expandmode : 'arrow', //arrow | row | accordion
		multiselect : false
	},

	_started : false,

	mixins : [ mxui.mixin._Scriptable ],

	startup : function() {
		if (this._started) //MWE: RVH said this can happen
			return;

		TreeView.widget.Commons.fixObjProps(this, ["blaat4", "blaat", "blaat2", "blaat3", "blaat5"])

		this._started = true;
		this.dict = {};
		this.types = [];
		this.columns = [];
		this.actions = [];
		this.actionsByName = {};
		this.dnd = {};

		this.edgesByParent = {};
		this.edgesByOwner = {};


		this.xsettings = [];
		this.splitPropsTo('xentity,xburstattr,xlisteningform,sortattr,sortdir,entityclazz,entitystyle,entitychannel', this.xsettings);
		for(var i = 0; i < this.xsettings.length; i++) {
			var x = this.xsettings[i];
			x.entitystyle = x.entitystyle.split(/\||\n/).join(";");
			x.filter = { references : {}, attributes : [] };

			this.addToSchema(x.xentity, x.xburstattr);
			this.addToSchema(x.xentity, x.sortattr);

			if (x.entitychannel) {
				this.connect(this, 'onSelect', dojo.hitch(this, function(channel,entity,selection) {
					if(selection != null && selection.isA(entity))
						dojo.publish(this.getContent() + "/"+ channel +"/context", [selection.data()]);
					else
						dojo.publish(this.getContent() + "/"+ channel +"/context", [null]);
				}, x.entitychannel, x.xentity));
			}
		}

		if (this.selectionref != '')
			this.selectionrefs = this.selectionref.split(';');

		this.offerInterface("close");

		this.setupTypes();

		this.setupLayout();
		this.setupActions();

		this.setupColumns();
		this.setupEvents();

		this.actLoaded();
	},

	setupLayout : function() {
		dojo.addClass(this.domNode, 'gg_tree');
		this.headerNode = mxui.dom.div({'class' : 'gg_header'});

		this.treeNode = mxui.dom.ul({'class': 'gg_children gg_root_wrapper'});
		if (this.hiderootnode)
			dojo.addClass(this.treeNode, 'gg_hiddenroot');

		dojo.place(this.headerNode, this.domNode);
		dojo.place(this.treeNode, this.domNode);
		dojo.attr(this.treeNode,  {
			tabindex : this.tabindex,
			focusindex : 0
		});
		mxui.wm.focus.addBox(this.treeNode);
		this.grabFocus();
	},

	setupActions : function() {
		var data = [];
		this.splitPropsTo('actname,actprogressmsg,actentity,actshowbutton,actautohide,actbuttoncaption,actconfirmtext,actbuttonimage,actmf,actisdefault,actonselect,actnoselectionmf,actshortcut', data);
		for(var i = 0, d = null; d = data[i]; i++) {
			var action = new TreeView.widget.Action(d, this);
			this.actions.push(action);
			this.actionsByName[action.actname] = action;
		}

		dojo.forEach(this.actions, function(action) {
			action.setup(this.headerNode);
			action.updateToSelection();
		}, this);
	},

	setupTypes : function() {
		this.splitPropsTo('entity,parentassocsingle,parentassocmulti,constraint,sortattr,sortdir,assoctype,assoccaption,showassocname,allowdnd,allowdndcopy,dropmf,assocclazz,assocstyle', this.types);
		var i = 0;
		dojo.forEach(this.types, function(type) {
			//more householding
			type.isRefset = type.parentassocsingle == '';
			type.assoc = type.isRefset ? type.parentassocmulti : type.parentassocsingle;

			type.index = i++;

			if (!type.assoc)
				this.configError("The relation '" + type.assoccaption + "' did not define a reference");

			delete type.parentassocmulti;
			delete type.parentassocsingle;

			type.parententity = type.assoc.split("/")[1];
			type.ownerentity = type.entity; //owner is always the entity

			if (type.allowdnd) {
				if (!type.dropmf)
					this.configError("The relation '" + type.assoccaption + "' allows drag and drop, but has no drop Microflow");
				//drag and drop needs the data to be able to update the object. This however is a costly data overhead...
				this.addToSchema(type.ownerentity, type.assoc);
			}

			type.assoc  = type.assoc.split("/")[0];

			//swap entity types if assoctype is 'from parent'
			if (type.assoctype == 'fromparent') {
				var e = type.entity;
				type.entity = type.parententity;
				type.parententity = e;
			}

			type.recursive = mx.meta.getEntity(type.entity).isA(type.parententity);

			type.assocstyle = type.assocstyle.split(/\||\n/).join(";");

			this.useDnd |= type.allowdnd;
		}, this);
	},

	setupColumns : function() {
		var data = [];
		this.splitPropsTo('columnname,columnentity,columnrendermode,columnattr,columnimage,columnaction,columnclazz,columnstyle,columndateformat,columnprefix,columnpostfix,columntruecaption,columnfalsecaption', data);
		for(var i = 0, d = null; d = data[i]; i++) {
			this.columns.push(new TreeView.widget.Colrenderer(d, this, i));
			if (d.columnaction && !(d.columnaction in this.actionsByName))
				this.configError(this.id + "  refers to unknown action " + d.columnaction);

			if (d.columnrendermode == "thumbnail" || d.columnrendermode == "systemimage" ) {
				//Add fileID and changedDate to schema
				if (d.columnattr == "")
					this.addToSchema(d.columnentity, "FileID");

				this.addToSchema(d.columnentity, d.columnattr.replace(/FileID/, "") + "changedDate");
			}

			this.addToSchema(d.columnentity, d.columnattr);
		}
	},

	addToSchema : function(entity, attr) {
		if (!attr)
			return;

		var t = this.getXsettings(entity);
		if (attr.indexOf("/") > -1) {
			if (!t)
				this.configError("Attribute " + attr + " refers to unconfigured type " + entity);

			var parts = attr.split("/");

			if (!(parts[0] in t.filter.references))
				t.filter.references[parts[0]] = { attributes : []};

			if (parts.length > 2)
				t.filter.references[parts[0]].attributes.push(parts[2]);
		}
		else {
			t.filter.attributes.push(attr);
		}
	},

	/**
		converts Mx reference data to a map with guids. The data can either be an array of guids, empty string or an object
	*/
	toMap : function(thing) {
		var res = {};
		if (thing == "")
			return res;
		if (dojo.isArray(thing)) {
			dojo.forEach(thing, function(guid) {
				res[guid] = true;
			});
			return res;
		}
		if (dojo.isObject(thing)) {
            if (thing.guid)
                res[thing.guid] = true;
			else
                return thing;
        }
		//a guid
		res[thing] = true;
		return res;
	},

	/**
	 * moves the domNode within the parent to the designated position. Precondition: domNode.parentNode
	 * @param  {[type]} domNode     [description]
	 * @param  {[type]} targetIndex [description]
	 */
	moveNode : function(domNode, targetIndex) {
		var parent = domNode.parentNode;

		if (parent == null)
			throw "tree.moveNode: domNode has no parent";

		dojo.place(domNode, parent, targetIndex);
	},

	/**
	 * find treewise the previous node preceding the startnode
	 * @param  {[type]} clazz     [description]
	 * @param  {[type]} limitNode [description]
	 * @return {[type]}
	 */
	findPreviousNode : function(node, clazz, limitNode) {
		if (node.previousElementSibling == null) {
			//find a matching parent
			var cur = node.parentNode;
			while (cur != null && cur != limitNode) {
				if (dojo.hasClass(cur, clazz))
					return cur;
				cur = cur.parentNode;
			}
		}
		else {
			//find a previously matching sibling
			var findLast = function(cur) {
				for(var i = cur.children.length - 1; i >= 0; i--) {
					if (dojo.style(cur.children[i], 'display') == 'none')
						continue;
					var l = findLast(cur.children[i]);
					if (l != null)
						return l;
				}

				if (dojo.hasClass(cur, clazz))
					return cur;
                return null;
			}

			var lc = findLast(node.previousElementSibling);
			if (lc)
				return lc;
			return this.findPreviousNode(node.previousElementSibling, clazz, limitNode);
		}
		return null;
	},

	findNextNode : function(node, clazz, limitNode) {
		var findChild = function(cur) {
			for(var i = 0; i < cur.children.length; i++) {
				if (dojo.style(cur.children[i], 'display') != 'none') {
					if (dojo.hasClass(cur.children[i], clazz))
						return cur.children[i];
					var fc = findChild(cur.children[i]);
					if (fc)
						return fc;
				}
			}
			return null;
		}

		var fc = findChild(node);
		if (fc)
			return fc;

		var cur = node;
		while (cur != limitNode && cur != null) {
			var n = cur.nextElementSibling;
			if (n != null && dojo.hasClass(n, clazz) && dojo.style(n, 'display') != 'none')
				return n;
			cur = cur.parentNode;
		}

		return null;
	},

	/* MWE: not sure if these suspended are supposed here, or where deliberately deleted before merging with main branch..
	   if it gives issues, the methods suspended / resumed should be deleted probably*/
	suspended : function() {

	},

	resumed : function() {
		//reapply selection to continue formloader
		var sel = this._selection;
		this._selection = null;
		this.setSelection(this._selection);
	},

    configError : function(msg) {
        TreeView.widget.Commons.configError(this, msg);
    },

    showError : function(e) {
        TreeView.widget.Commons.error(e, this);
    },

	splitPropsTo : function(props, target) {
		TreeView.widget.Commons.splitPropsTo(this, props, target);
	},

	close : function(){
		this.disposeContent();
	},

	uninitialize : function() {
		this.root && this.root.free();

		if (this.searchControl)
			this.searchControl.free();

		dojo.forEach(this.columns, function(column) {
			column.free();
		});

		dojo.forEach(this.actions, function(action) {
			action.free();
		});
	}
});


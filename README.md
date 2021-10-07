# TreeViewAndGridView (DEPRECATED) [![Support](https://img.shields.io/badge/Mendix%20Support%3A-Community-orange.svg)](https://docs.mendix.com/community/app-store/app-store-content-support) 

> **This widget has been removed from the Marketplace and is deprecated. Do not use this widget.**

The treeview and gridview widgets provide the highly customizable grid widgets as seen in home.mendix.com.

## Contributing

For more information on contributing to this repository visit [Contributing to a GitHub repository](https://world.mendix.com/display/howto50/Contributing+to+a+GitHub+repository)!

## Description

The treeview and gridview widgets provide the highly customizable grid widgets as seen in home.mendix.com. 

The Treeview widget is a feature rich widget to display tree like structures (or lists). Different kinds of associations and recursive structures can be rendered using this widget. The widget supports drag and drop out of the box. 

The gridview can be used to display tabular data and supports filters, search, paging, editing and advanced renderings out of the box!

## Dependencies
 

- Mendix 3.0 environment

## Gridview Configuration
The gridview configuration is quite similar to the treeview configuration. For details, please read the documentation of the properties in the modeler. Complex configurations are covered int he Treeview and Gridview demo project. 

##Treeview Configuration
This section only describes the general configuration of the widget. For detailed information about specific properties, please read the help texts of the widget properties inside the modeler. The best way to understand the configuration of the treeview widget is to read this documentation and inspect the treeview demo project.

*Disclaimer: The correct behavior of the treeview depends highly in a correct configuration. Incoming support tickets which are a result of not carefully reading this documentation will not be taken into consideration. Furthermore a test project is always required, as the result of the many configuration scenarios available.*

The treeview is capable of displaying several different associations in multiple directions in the same treeview. Configuring the widget should not be to hard if you follow the next 4 steps. For more complex scenario's see the sections below.The 4 steps correspond to the 4 Tree configuration properties of the widget.

## 1. Configure entities

As a prelude to your treeview setup, you need to mention all the entity types you are going to display in the widget here. If you use inheritance, it suffices to define only the most generic type.*

The treeview always require a context object (thus; the widget can only be used inside a dataview or templategrid). and can only display objects which are somehow related to your context. If you are in the rare case that you have no such context, see the demo project about how to create a dummy context. The context object should always be part of your entity configuration! Otherwise the treeview won't load at all.

For each type, you can define a view properties; sorting, cache bust (see the refreshing the tree section) and custom styling for this object type. We recommend to use classes and define them in your custom theme, as they provide a lot of flexibility and possibilities, but for a quick prototype inline styling might work as well. If you use drag and drop, the sort attribute should be an ascending float attribute. See the drag and drop section for more information.

When you configured all entities you intend to display in the widget, you can define the relations between them.

* For inheritance, only the first matching configuration is always applied. So define the most generic type last.

## 2. Configure the associations to display

To define a relation, first select the object from where the association is leaving (association owner property). This allow you the select an association is the association property. The association property comes in two flavors, but you need to define only one, depending on the type of relation you want to display (as the tree supports both references and reference sets).

An important but complex property is the association direction. This property defines in which direction the relation should be used. Remember that the treeview always renders from parent to child. So if the owner is the child, than the association is actually used in the reverse direction. If you want to be able to navigate an association in two direction, you can just define the relation twice; one for each direction. See the first demo of the demo project for an example. The following table might clarify this as well:

Domain model | Navigation direction
--- | --- 
 Order  * --- referenceset ---> * Orderline	| From order to orderline: The association owner (that is; the order) is the parent. From orderline to order: The association owner (that is; the order) is the child (this is a bit artificial case)
 Order  1 <---- reference ---- * Orderline | From order to orderline: The association owner (that is; the orderline) is the child. From orderline to order: The association owner (that is; the orderline) is the parent
 
The *show relation name* property indicates if the items inside this relation should be wrapped inside a helper node. If so, the class and styling attributes are applied to this node.

For the constraint and drag and drop properties, see their respective sections. **Note that using a constraint alters the refresh behavior of the widget, so use it carefully.**

## 3. Configure the rendering

The best way to learn how to define the rendering is to just play around with it, or inspect the various example in the demo project. Just remember that after defining the entities and associations the treeview does not know how to display anything. So for every entity type you are using in the widget, you should define at least one rendering. For each rendering, do not forget to select the correct render mode.

To influence the layout of a rendering, the css properties width, clear and float are very useful. See the flower list in the demo project for an example. Be careful though, **css properties in the style attribute should be separated by '|' (pipe) ore newlines. Semicolons as you would use in a CSS file are not supported.**

The *onclick* action property indicates that a (part of) the rendering is clickable. The property refers to the name of an action as defined in step 4.

## 4. Define actions

Actions are pretty straight forward to define as well. If the applies to type property is left empty, the action can always be invoked and it will receive the context object as parameter. Otherwise, the microflow can only be invoked if the current selection matched the type of applies to.

## Advanced: Refreshing

The content of an item is always refreshed automatically. The children of new items are not always refreshed automatically. The treeview tries to refresh automatically as much as possible, however, there are a few complex cases where this cant be done as the widget is not notified about new or deleted objects. **Note that most of the cases explained below are demonstrated by the flower family example.**

#### Case: add a new child when the reference owner is the child

Sadly, this cannot detected by the widget, as it does not trigger a change on the parent, and the child is not in the treeview yet. If you need this behavior, using a cache bust attribute (on the parent entity) is the way to go. Whenever the the treeview receives a new value for this attribute, it reloads the children of an item. The flower list example demonstrates this nicely.

#### Case: an object is deleted from the database entirely

The treeview always picks it up when an object is removed from a reference(set). However, if an object is deleted entirely, this will not result on a change of the the reference(set).

If the owner of the reference is not the object being deleted, just remove the referred object from the reference first and then delete that object (that can be done in the same microflow).

If the owner of the reference is the object being deleted, the parent needs to be refreshed manually, again this can be done by using the cache bust attribute of the parent.

#### Case: an object is added to a constrained relation

See the next section

## Advanced: Constrained relations

When removing an item from a constrained relation, this is handled in the same way as removing an object from an unconstrained relation. However **adding a child to a constrained relation is never picked up automatically**, as the new object might not pass the given constraint. To avoid unnecessary retrieves from the server, you need to indicate in your model that an object needs to refetch its children by the cache bust attribute as explained above.

## Advanced: Drag and drop
Enabling drag and drop on a relation allows items to be both dragged from it and dropped to it. The widget automatically calculates where an item can be dropped, based on the type of the object your are holding, the object or relation you are dragging over and the copy state.

The copy state is triggered by pressing the control key. If your domain model does not allow two parents of the same of a child (for example order 1 <-- reference * orderline does not allow to orders for an orderline) it is not allowed to drop.

If an item has a ascending float as sort attribute, it is possible to drop on a specific position in a relation. The average of the two nearest item is then used as the new position. Note that there is a small chance that an index collision occurs, if you want to avoid this, you have to check this in your microflow when the drop microflow is triggered.

The treeview does not persist any drop operations, nor does it refresh any data, it relies on the ondrop microflow to know what should be done next. This means that you can alter the actual drop in your microflow, or even roll it back.

The actual ondrop microflows that are triggered depend on your domain model. If the drag and drop operation results in only one reference being changed (this is usually the case if the owner is the child) than the ondrop microflow of that child is triggered. However, if the drop operation moves an item from one referenceset based relation to another, where the owner is the parent, the on drop microflows of both the old an new parent is triggered, as they are the objects that are actually being changed by the drop. See the flower family and organizations examples which display the various variations.

## Known bugs
 
- IE 7 will not render the layout of the widget correctly due to its complexity. The functional behavior should be correct however, so you might consider applying project specific custom styling for IE 7 on this widget. We however do not support this scenario.

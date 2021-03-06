/* eslint consistent-this: [ "error", "control" ] */
wp.mediaWidgets = ( function( $ ) {
	'use strict';

	var component = {};

	/**
	 * Widget control (view) constructors, mapping widget id_base to subclass of MediaWidgetControl.
	 *
	 * Media widgets register themselves by assigning subclasses of MediaWidgetControl onto this object by widget ID base.
	 *
	 * @type {Object.<string, wp.mediaWidgets.MediaWidgetModel>}
	 */
	component.controlConstructors = {};

	/**
	 * Widget model constructors, mapping widget id_base to subclass of MediaWidgetModel.
	 *
	 * Media widgets register themselves by assigning subclasses of MediaWidgetControl onto this object by widget ID base.
	 *
	 * @type {Object.<string, wp.mediaWidgets.MediaWidgetModel>}
	 */
	component.modelConstructors = {};

	/**
	 * Media widget control.
	 *
	 * @class MediaWidgetControl
	 * @constructor
	 * @abstract
	 */
	component.MediaWidgetControl = Backbone.View.extend( {

		/**
		 * Translation strings.
		 *
		 * The mapping of translation strings is handled by media widget subclasses,
		 * exported from PHP to JS such as is done in WP_Widget_Image::enqueue_admin_scripts().
		 *
		 * @type {Object}
		 */
		l10n: {
			add_to_widget: '{{add_to_widget}}',
			select_media: '{{select_media}}'
		},

		/**
		 * Widget ID base.
		 *
		 * This may be defined by the subclass. It may be exported from PHP to JS
		 * such as is done in WP_Widget_Image::enqueue_admin_scripts(). If not,
		 * it will attempt to be discovered by looking to see if this control
		 * instance extends each member of component.controlConstructors, and if
		 * it does extend one, will use the key as the id_base.
		 *
		 * @type {string}
		 */
		id_base: '',

		/**
		 * Mime type.
		 *
		 * This must be defined by the subclass. It may be exported from PHP to JS
		 * such as is done in WP_Widget_Image::enqueue_admin_scripts().
		 *
		 * @type {string}
		 */
		mime_type: '',

		/**
		 * View events.
		 *
		 * @type {Object}
		 */
		events: {
			'click .select-media': 'selectMedia',
			'click .edit-media': 'editMedia'
		},

		/**
		 * Initialize.
		 *
		 * @param {Object}         options - Options.
		 * @param {Backbone.Model} options.model - Model.
		 * @param {function}       options.template - Control template.
		 * @param {jQuery}         options.el - Control container element.
		 * @returns {void}
		 */
		initialize: function initialize( options ) {
			var control = this;

			Backbone.View.prototype.initialize.call( control, options );

			// Allow methods to be passed in with control context preserved.
			_.bindAll( control, 'syncModelToInputs', 'render', 'fetchSelectedAttachment', 'renderPreview' );

			if ( ! control.id_base ) {
				_.find( component.controlConstructors, function( Constructor, idBase ) {
					if ( control instanceof Constructor ) {
						control.id_base = idBase;
						return true;
					}
					return false;
				} );
				if ( ! control.id_base ) {
					throw new Error( 'Missing id_base.' );
				}
			}

			// Re-render the preview when the attachment changes.
			control.selectedAttachment = new wp.media.model.Attachment( { id: 0 } );
			control.listenTo( control.selectedAttachment, 'change', control.renderPreview );

			// Make sure a copy of the selected attachment is always fetched.
			control.model.on( 'change:attachment_id', control.fetchSelectedAttachment );
			control.fetchSelectedAttachment();

			/*
			 * Sync the widget instance model attributes onto the hidden inputs that widgets currently use to store the state.
			 * In the future, when widgets are JS-driven, the underlying widget instance data should be exposed as a model
			 * from the start, without having to sync with hidden fields. See <https://core.trac.wordpress.org/ticket/33507>.
			 */
			control.listenTo( control.model, 'change', control.syncModelToInputs );

			control.listenTo( control.model, 'change', control.render );

			// Update the title.
			control.$el.on( 'input', '.title', function() {
				control.model.set( {
					title: $.trim( $( this ).val() )
				} );
			} );
		},

		/**
		 * Fetch the selected attachment if necessary.
		 *
		 * @return {void}
		 */
		fetchSelectedAttachment: function fetchSelectedAttachment() {
			var control = this, attachment;

			// Skip if selectedAttachment is already updated.
			if ( control.model.get( 'attachment_id' ) === control.selectedAttachment.get( 'id' ) ) {
				return;
			}

			control.selectedAttachment.clear( { silent: true } );
			if ( ! control.model.get( 'attachment_id' ) ) {
				control.selectedAttachment.set( { id: 0 } );
			} else {
				attachment = new wp.media.model.Attachment( {
					id: control.model.get( 'attachment_id' )
				} );
				attachment.fetch().done( function() {
					control.selectedAttachment.set( attachment.attributes );
				} );
			}
		},

		/**
		 * Sync the model attributes to the hidden inputs.
		 *
		 * @returns {void}
		 */
		syncModelToInputs: function syncModelToInputs() {
			var control = this;
			control.$el.next( '.widget-content' ).find( '.media-widget-instance-property' ).each( function() {
				var input = $( this ), value;
				value = control.model.get( input.data( 'property' ) );
				if ( _.isUndefined( value ) ) {
					return;
				}
				value = String( value );
				if ( input.val() === value ) {
					return;
				}
				input.val( value );
				input.trigger( 'change' );
			} );
		},

		/**
		 * Get template.
		 *
		 * @return {Function} Template.
		 */
		template: function template() {
			var control = this;
			if ( ! $( '#tmpl-widget-media-' + control.id_base + '-control' ).length ) {
				throw new Error( 'Missing widget control template for ' + control.id_base );
			}
			return wp.template( 'widget-media-' + control.id_base + '-control' );
		},

		/**
		 * Render template.
		 *
		 * @returns {void}
		 */
		render: function render() {
			var control = this, titleInput;

			if ( ! control.templateRendered ) {
				control.$el.html( control.template()( control.model.attributes ) );
				control.templateRendered = true;
			}

			titleInput = control.$el.find( '.title' );
			if ( ! titleInput.is( document.activeElement ) ) {
				titleInput.val( control.model.get( 'title' ) );
			}

			control.$el.toggleClass( 'selected', control.isSelected() );
		},

		/**
		 * Render media preview.
		 *
		 * @abstract
		 * @returns {void}
		 */
		renderPreview: function renderPreview() {
			throw new Error( 'renderPreview must be implemented' );
		},

		/**
		 * Whether a media item is selected.
		 *
		 * @return {boolean} Whether selected.
		 */
		isSelected: function isSelected() {
			var control = this;

			return Boolean( control.model.get( 'attachment_id' ) || control.model.get( 'url' ) );
		},

		/**
		 * Open the media select frame to chose an item.
		 *
		 * @abstract
		 * @returns {void}
		 */
		selectMedia: function selectMedia() {
			throw new Error( 'selectMedia not implemented' );
		},

		/**
		 * Get the instance props from the media selection frame.
		 *
		 * @param {wp.media.view.MediaFrame.Select} mediaFrame Select frame.
		 * @return {Object} Props.
		 */
		getSelectFrameProps: function getSelectFrameProps( mediaFrame ) {
			var attachment, props;

			attachment = mediaFrame.state().get( 'selection' ).first().toJSON();
			if ( _.isEmpty( attachment ) ) {
				return {};
			}

			props = {
				attachment_id: attachment.id,
				url: attachment.url
			};

			return props;
		},

		/**
		 * Open the media image-edit frame to modify the selected item.
		 *
		 * @abstract
		 * @returns {void}
		 */
		editMedia: function editMedia() {
			throw new Error( 'editMedia not implemented' );
		}
	} );

	/**
	 * Media widget model.
	 *
	 * @class MediaWidgetModel
	 * @constructor
	 */
	component.MediaWidgetModel = Backbone.Model.extend( {

		/**
		 * Instance schema.
		 *
		 * This adheres to JSON Schema and subclasses should have their schema
		 * exported from PHP to JS such as is done in WP_Widget_Image::enqueue_admin_scripts().
		 *
		 * @param {Object.<string, Object>}
		 */
		schema: {
			title: {
				type: 'string',
				'default': ''
			},
			attachment_id: {
				type: 'integer',
				'default': 0
			},
			url: {
				type: 'string',
				'default': ''
			}
		},

		/**
		 * Get default attribute values.
		 *
		 * @returns {Object} Mapping of property names to their default values.
		 */
		defaults: function() {
			var defaults = {};
			_.each( this.schema, function( fieldSchema, field ) {
				defaults[ field ] = fieldSchema['default'];
			} );
			return defaults;
		},

		/**
		 * Set attribute value(s).
		 *
		 * This is a wrapped version of Backbone.Model#set() which allows us to
		 * cast the attribute values from the hidden inputs' string values into
		 * the appropriate data types (integers or booleans).
		 *
		 * @param {string|Object} key       Attribute name or attribute pairs.
		 * @param {mixed|Object}  [val]     Attribute value or options object.
		 * @param {Object}        [options] Options when attribute name and value are passed separately.
		 * @return {wp.mediaWidgets.MediaWidgetModel} This model.
		 */
		set: function set( key, val, options ) {
			var model = this, attrs, opts, castedAttrs; // eslint-disable-line consistent-this
			if ( null === key ) {
				return model;
			}
			if ( 'object' === typeof key ) {
				attrs = key;
				opts = val;
			} else {
				attrs = {};
				attrs[ key ] = val;
				opts = options;
			}

			castedAttrs = {};
			_.each( attrs, function( value, name ) { // eslint-disable-line complexity
				var type;
				if ( ! model.schema[ name ] ) {
					castedAttrs[ name ] = value;
					return;
				}
				type = model.schema[ name ].type;
				if ( 'integer' === type ) {
					castedAttrs[ name ] = parseInt( value, 10 );
				} else if ( 'boolean' === type ) {
					castedAttrs[ name ] = ! ( ! value || '0' === value || 'false' === value );
				} else {
					castedAttrs[ name ] = value;
				}
			} );

			return Backbone.Model.prototype.set.call( this, castedAttrs, opts );
		}
	} );

	/**
	 * Collection of all widget model instances.
	 *
	 * @type {Backbone.Collection}
	 */
	component.modelCollection = new ( Backbone.Collection.extend( {
		model: component.MediaWidgetModel
	} ) )();

	/**
	 * Mapping of widget ID to instances of MediaWidgetControl subclasses.
	 *
	 * @type {Object.<string, wp.mediaWidgets.MediaWidgetControl>}
	 */
	component.widgetControls = {};

	/**
	 * Handle widget being added or initialized for the first time at the widget-added event.
	 *
	 * @param {jQuery.Event} event - Event.
	 * @param {jQuery}       widgetContainer - Widget container element.
	 * @returns {void}
	 */
	component.handleWidgetAdded = function handleWidgetAdded( event, widgetContainer ) {
		var widgetContent, controlContainer, widgetForm, idBase, ControlConstructor, ModelConstructor, modelAttributes, widgetControl, widgetModel, widgetId;
		widgetForm = widgetContainer.find( '> .widget-inside > .form, > .widget-inside > form' ); // Note: '.form' appears in the customizer, whereas 'form' on the widgets admin screen.
		widgetContent = widgetForm.find( '> .widget-content' );
		idBase = widgetForm.find( '> .id_base' ).val();
		widgetId = widgetForm.find( '> .widget-id' ).val();

		// Prevent initializing already-added widgets.
		if ( component.widgetControls[ widgetId ] ) {
			return;
		}

		ControlConstructor = component.controlConstructors[ idBase ];
		if ( ! ControlConstructor ) {
			return;
		}

		ModelConstructor = component.modelConstructors[ idBase ] || component.MediaWidgetModel;

		/*
		 * Create a container element for the widget control (Backbone.View).
		 * This is inserted into the DOM immediately before the the .widget-control
		 * element because the contents of this element are essentially "managed"
		 * by PHP, where each widget update cause the entire element to be emptied
		 * and replaced with the rendered output of WP_Widget::form() which is
		 * sent back in Ajax request made to save/update the widget instance.
		 * To prevent a "flash of replaced DOM elements and re-initialized JS
		 * components", the JS template is rendered outside of the normal form
		 * container.
		 */
		controlContainer = $( '<div class="media-widget-control"></div>' );
		widgetContent.before( controlContainer );

		/*
		 * Sync the widget instance model attributes onto the hidden inputs that widgets currently use to store the state.
		 * In the future, when widgets are JS-driven, the underlying widget instance data should be exposed as a model
		 * from the start, without having to sync with hidden fields. See <https://core.trac.wordpress.org/ticket/33507>.
		 */
		modelAttributes = {};
		widgetContent.find( '.media-widget-instance-property' ).each( function() {
			var input = $( this );
			modelAttributes[ input.data( 'property' ) ] = input.val();
		} );
		modelAttributes.id = widgetId;

		widgetModel = new ModelConstructor( modelAttributes );

		widgetControl = new ControlConstructor( {
			el: controlContainer,
			model: widgetModel
		} );
		widgetControl.render();

		/*
		 * Note that the model and control currently won't ever get garbage-collected
		 * when a widget gets removed/deleted because there is no widget-removed event.
		 */
		component.modelCollection.add( [ widgetModel ] );
		component.widgetControls[ widgetModel.get( 'id' ) ] = widgetControl;
	};

	/**
	 * Sync widget instance data sanitized from server back onto widget model.
	 *
	 * This gets called via the 'widget-updated' event when saving a widget from
	 * the widgets admin screen and also via the 'widget-synced' event when making
	 * a change to a widget in the customizer.
	 *
	 * @param {jQuery.Event} event - Event.
	 * @param {jQuery}       widgetContainer - Widget container element.
	 * @returns {void}
	 */
	component.handleWidgetUpdated = function handleWidgetUpdated( event, widgetContainer ) {
		var widgetForm, widgetContent, widgetId, widgetControl, attributes = {};
		widgetForm = widgetContainer.find( '> .widget-inside > .form, > .widget-inside > form' );
		widgetContent = widgetForm.find( '> .widget-content' );
		widgetId = widgetForm.find( '> .widget-id' ).val();

		widgetControl = component.widgetControls[ widgetId ];
		if ( ! widgetControl ) {
			return;
		}

		// Make sure the server-sanitized values get synced back into the model.
		widgetContent.find( '.media-widget-instance-property' ).each( function() {
			var property = $( this ).data( 'property' );
			attributes[ property ] = $( this ).val();
		} );
		delete attributes.id; // Read only.

		// Suspend syncing model back to inputs when syncing from inputs to model, preventing infinite loop.
		widgetControl.stopListening( widgetControl.model, 'change', widgetControl.syncModelToInputs );
		widgetControl.model.set( attributes );
		widgetControl.listenTo( widgetControl.model, 'change', widgetControl.syncModelToInputs );
	};

	/**
	 * Initialize functionality.
	 *
	 * This function exists to prevent the JS file from having to boot itself.
	 * When WordPress enqueues this script, it should have an inline script
	 * attached which calls wp.mediaWidgets.init().
	 *
	 * @returns {void}
	 */
	component.init = function init() {
		var $document = $( document );
		$document.on( 'widget-added', component.handleWidgetAdded );
		$document.on( 'widget-synced widget-updated', component.handleWidgetUpdated );

		/*
		 * Manually trigger widget-added events for media widgets on the admin
		 * screen once they are expanded. The widget-added event is not triggered
		 * for each pre-existing widget on the widgets admin screen like it is
		 * on the customizer. Likewise, the customizer only triggers widget-added
		 * when the widget is expanded to just-in-time construct the widget form
		 * when it is actually going to be displayed. So the following implements
		 * the same for the widgets admin screen, to invoke the widget-added
		 * handler when a pre-existing media widget is expanded.
		 */
		$( function initializeExistingWidgetContainers() {
			var widgetContainers;
			if ( 'widgets' !== window.pagenow ) {
				return;
			}
			widgetContainers = $( '.widgets-holder-wrap:not(#available-widgets)' ).find( 'div.widget' );
			widgetContainers.one( 'click.toggle-widget-expanded', function toggleWidgetExpanded() {
				var widgetContainer = $( this );
				component.handleWidgetAdded( new jQuery.Event( 'widget-added' ), widgetContainer );
			} );
		});
	};

	return component;
} )( jQuery );

<?php
/**
 * Widget API: WP_Media_Widget class
 *
 * @package WordPress
 * @subpackage Widgets
 * @since 4.8.0
 */

/**
 * Core class that implements a media widget.
 *
 * @since 4.8.0
 *
 * @see WP_Widget
 */
class WP_Media_Widget extends WP_Widget {
	private $default_instance = array(
		'id'          => '',
		'title'       => '',
		'description' => '',
		'link'        => '',
		'align'       => 'none',
	);

	/**
	 * Constructor.
	 *
	 * @since 4.8.0
	 * @access public
	 *
	 * @param string $id_base         Optional Base ID for the widget, lowercase and unique. If left empty,
	 *                                a portion of the widget's class name will be used Has to be unique.
	 * @param string $name            Optional. Name for the widget displayed on the configuration page.
	 *                                Default empty.
	 * @param array  $widget_options  Optional. Widget options. See wp_register_sidebar_widget() for
	 *                                information on accepted arguments. Default empty array.
	 * @param array  $control_options Optional. Widget control options. See wp_register_widget_control()
	 *                                for information on accepted arguments. Default empty array.
	 */
	public function __construct( $id_base = '', $name = '', $widget_options = array(), $control_options = array() ) {
		$widget_opts = wp_parse_args( $widget_options, array(
			'classname' => 'widget_media',
			'description' => __( 'Display media such as images, video, or audio in your sidebar.' ),
			'customize_selective_refresh' => true,
		) );

		$control_opts = wp_parse_args( $control_options, array() );

		parent::__construct(
			$id_base ? $id_base : 'wp-media-widget',
			$name ? $name : __( 'Media' ),
			$widget_opts,
			$control_opts
		);

		if ( is_customize_preview() ) {
			$this->enqueue_mediaelement_script();
		}

		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_styles' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_scripts' ) );
	}

	/**
	 * Displays the widget on the front-end.
	 *
	 * @since 4.8.0
	 * @access public
	 *
	 * @see WP_Widget::widget()
	 *
	 * @param array $args     Display arguments including before_title, after_title, before_widget, and after_widget.
	 * @param array $instance Saved setting from the database.
	 */
	public function widget( $args, $instance ) {
		$output = $args['before_widget'];

		$instance = array_merge( $this->default_instance, $instance );

		if ( $instance['title'] ) {
			$title = apply_filters( 'widget_title', $instance['title'], $instance, $this->id_base );
			$output .= $args['before_title'] . $title . $args['after_title'];
		}
		if ( $instance['description'] ) {
			$output .= '<p class="attachment-description align' . $instance['align'] . '">' . $instance['description'] . '</p>';
		}

		// Render the media.
		$attachment = $instance['id'] ? get_post( $instance['id'] ) : null;
		if ( $attachment ) {
			$output .= $this->render_media( $attachment, $args['widget_id'], $instance );
			$output .= $this->get_responsive_style( $attachment, $args['widget_id'], $instance );
		}

		$output .= $args['after_widget'];

		echo $output;
	}

	/**
	 * Sanitizes the widget form values as they are saved.
	 *
	 * @since 4.8.0
	 * @access public
	 *
	 * @see WP_Widget::update()
	 *
	 * @param array $new_instance Values just sent to be saved.
	 * @param array $old_instance Previously saved values from database.
	 * @return array Updated safe values to be saved.
	 */
	public function update( $new_instance, $old_instance ) {
		$instance = $old_instance;

		// ID, title, scale
		$instance['id']    = (int) $new_instance['id'];
		$instance['title'] = sanitize_text_field( $new_instance['title'] );
		$instance['scale'] = isset( $new_instance['scale'] ) ? sanitize_text_field( $new_instance['scale'] ) : '';

		// Everything else.
		$instance['align'] = sanitize_text_field( $new_instance['align'] );
		$instance['size']  = sanitize_text_field( $new_instance['size'] );
		$instance['link']  = sanitize_text_field( $new_instance['link'] );

		return $instance;
	}

	/**
	 * Get type of a media attachment
	 *
	 * @since 4.8.0
	 * @access private
	 *
	 * @param WP_Post $attachment Attachment object.
	 *
	 * @return String type string such as image, audio and video. Returns empty string for unknown type
	 */
	private function get_typeof_media( $attachment ) {
		if ( wp_attachment_is_image( $attachment ) ) {
			return 'image';
		}

		if ( wp_attachment_is( 'audio', $attachment ) ) {
			return 'audio';
		}

		if ( wp_attachment_is( 'video', $attachment ) ) {
			return 'video';
		}

		// unknown media type
		return '';
	}

	/**
	 * Renders a single media attachment
	 *
	 * @since 4.8.0
	 * @access public
	 *
	 * @param WP_Post $attachment Attachment object.
	 * @param string  $widget_id  Widget ID.
	 * @param array   $instance   Current widget instance arguments.
	 * @return string
	 */
	public function render_media( $attachment, $widget_id, $instance ) {
		$output = '';
		$renderer = 'render_' . $this->get_typeof_media( $attachment );

		if ( method_exists( $this, $renderer ) ) {
			$output .= call_user_func( array( $this, $renderer ), $attachment, $widget_id, $instance );
		}

		return $output;
	}

	/**
	 * Renders an image attachment preview.
	 *
	 * @since 4.8.0
	 * @access private
	 *
	 * @param WP_Post $attachment Attachment object.
	 * @param string  $widget_id  Widget ID.
	 * @param array   $instance   Current widget instance arguments.
	 * @return string
	 */
	private function render_image( $attachment, $widget_id, $instance ) {
		$has_caption   = ( ! empty( $attachment->post_excerpt ) );
		$is_responsive = ( ! empty( $instance['scale'] ) );

		$img_attrs = array(
			'data-id' => $widget_id,
			'title'   => $attachment->post_title,
			'class'   => 'image wp-image-' . $attachment->ID,
		);

		if ( ! $has_caption ) {
			$img_attrs['class'] .= ' align' . $instance['align'];
		}

		if ( $is_responsive ) {
			$img_attrs['style'] = 'width: 100%; height: auto;';
		}

		$image = wp_get_attachment_image( $attachment->ID, $instance['size'], false, $img_attrs );

		if ( ! $has_caption ) {
			return $image;
		}

		$fig_attrs = array(
			'id'      => $widget_id . '-caption',
			'width'   => get_option( $instance['size'] . '_size_w'),
			'align'   => $instance['align'],
			'caption' => $attachment->post_excerpt
		);

		$figure = img_caption_shortcode( $fig_attrs, $image );

		return $figure;
	}

	/**
	 * Renders an audio attachment preview.
	 *
	 * @since 4.8.0
	 * @access private
	 *
	 * @param WP_Post $attachment Attachment object.
	 * @param string  $widget_id  Widget ID.
	 * @param array   $instance   Current widget instance arguments.
	 * @return string
	 */
	private function render_audio( $attachment, $widget_id, $instance ) {
		if ( in_array( $instance['link'], array( 'file', 'post' ) ) ) {
			return $this->create_link_for( $attachment, $instance['link'] );
		}

		return wp_audio_shortcode( array(
			'src' => wp_get_attachment_url( $attachment->ID )
		) );
	}

	/**
	 * Renders a video attachment preview.
	 *
	 * @since 4.8.0
	 * @access private
	 *
	 * @param WP_Post $attachment Attachment object.
	 * @param string  $widget_id  Widget ID.
	 * @param array   $instance   Current widget instance arguments.
	 * @return string
	 */
	private function render_video( $attachment, $widget_id, $instance ) {
		if ( in_array( $instance['link'], array( 'file', 'post' ) ) ) {
			return $this->create_link_for( $attachment, $instance['link'] );
		}

		return wp_video_shortcode( array(
			'src' => wp_get_attachment_url( $attachment->ID )
		) );
	}

	/**
	 * Get styles for responsifying the widget
	 *
	 * @since 4.8.0
	 * @access private
	 *
	 * @param WP_Post $attachment Attachment object.
	 * @param string  $widget_id  Widget ID.
	 * @param array   $instance   Current widget instance arguments.
	 * @return string styles for responsive media
	 */
	private function get_responsive_style( $attachment, $widget_id, $instance ) {
		if ( empty( $instance['scale'] ) || wp_attachment_is( 'audio', $attachment ) ) {
			return;
		}

		$output = '<style type="text/css">';

		if ( wp_attachment_is_image( $attachment ) ) {
			$output .= "#{$widget_id}-caption{ width: 100% !important; }";
		}

		if ( wp_attachment_is( 'video', $attachment ) ) {
			$output .= "#{$widget_id} .wp-video{ width: 100% !important; }";
		}

		$output .= '</style>';

		return $output;
	}


	/**
	 * Creates and returns a link for an attachment
	 *
	 * @param WP_Post $attachment Attachment object.
	 * @param string  $type       link type.
	 * @return string
	 */
	private function create_link_for( $attachment, $type = '' ) {
		$url = '#';
		if ( 'file' === $type ) {
			$url = wp_get_attachment_url( $attachment->ID );
		} elseif ( 'post' === $type ) {
			$url = get_attachment_link( $attachment->ID );
		}

		return '<a href="' . $url  . '">' . $attachment->post_title . '</a>';
	}

	/**
	 * Outputs the settings update form.
	 *
	 * @since 4.8.0
	 * @access public
	 *
	 * @param array $saved_instance Current settings.
	 * @return string Default return is 'noform'.
	 */
	public function form( $saved_instance ) {
		$defaults = array(
			'title'  => '',
			// Attachment props.
			'id'     => '',
			'align'  => '',
			'size'   => '',
			'link'   => '',
			'scale'  => '',
		);

		$instance   = wp_parse_args( (array) $saved_instance, $defaults );
		$attachment = empty( $instance['id'] ) ? null : get_post( $instance['id'] );
		$widget_id  = $this->id;
		?>
		<div class="<?php echo esc_attr( $widget_id ); ?> media-widget-preview">
			<p>
				<label for="<?php echo $this->get_field_id( 'title' ); ?>"><?php esc_html_e( 'Title:' ); ?></label>
				<input class="widefat" id="<?php echo $this->get_field_id( 'title' ); ?>" name="<?php echo $this->get_field_name( 'title' ); ?>" type="text" value="<?php echo esc_attr( $instance['title'] ); ?>" />
			</p>

			<p>
				<?php esc_html_e( 'Add an image, video, or audio to your sidebar.' ); ?>
			</p>

			<div class="media-widget-admin-preview" id="<?php echo $widget_id; ?>">
			<?php
				if ( $attachment ) {
					echo $this->render_media( $attachment, $widget_id, $instance );
					echo $this->get_responsive_style( $attachment, $widget_id, $instance );
				}
			?>
			</div>

			<p class="extras">
				<input
					type="checkbox"
					name="<?php echo $this->get_field_name( 'scale' ) ?>"
					id="<?php echo $this->get_field_id( 'scale' )?>"
					value="on"
					<?php checked( 'on', $instance[ 'scale' ]  ); ?>
				/>
				<label for="<?php echo $this->get_field_id( 'scale' )?>">
					<?php esc_html_e( 'Scale to fit width' ); ?>
				</label>
			</p>

			<p>
				<button type="button" data-id="<?php echo esc_attr( $widget_id ); ?>" class="button select-media widefat">
					<?php $attachment ? esc_html_e( 'Change Media' ) : esc_html_e( 'Select Media' ); ?>
				</button>
			</p>

			<?php
			// Use hidden form fields to capture the attachment details from the media manager.
			unset( $instance['title'], $instance['scale'] );
			?>

			<?php foreach ( $instance as $name => $value ) : ?>
				<input type="hidden" id="<?php echo esc_attr( $this->get_field_id( $name ) ); ?>" name="<?php echo esc_attr( $this->get_field_name( $name ) ); ?>" value="<?php echo esc_attr( $value ); ?>" />
			<?php endforeach; ?>
		</div>
		<?php
	}

	/**
	 * Registers the stylesheet for handling the widget in the back-end.
	 *
	 * @since 4.8.0
	 * @access public
	 */
	public function enqueue_admin_styles() {
		wp_enqueue_style( 'wp-media-widget' );
	}

	/**
	 * Registers the scripts for handling the widget in the back-end.
	 *
	 * @since 4.8.0
	 * @access public
	 */
	public function enqueue_admin_scripts() {
		global $pagenow;

		// Bail if we are not in the widgets or customize screens.
		if ( 'widgets.php' !== $pagenow && ! is_customize_preview() ) {
			return;
		}

		// Load the required media files for the media manager.
		wp_enqueue_media();

		wp_enqueue_script( 'wp-media-widget' );

		add_action( 'admin_print_footer_scripts', array( $this, 'admin_print_footer_scripts' ) );
	}

	/**
	 * Prints footer scripts.
	 *
	 * @since 4.8.0
	 * @access public
	 */
	public function admin_print_footer_scripts() {
		?>
		<script type="text/html" id="tmpl-wp-media-widget-audio">
		<?php wp_underscore_audio_template() ?>
		</script>

		<script type="text/html" id="tmpl-wp-media-widget-video">
		<?php wp_underscore_video_template() ?>
		</script>

		<?php
	}

	/**
	 * Enqueue mediaelement script and style if in need,
	 * so the first instance of the media widget can properly handle media elements.
	 *
	 * @since 4.8.0
	 * @access private
	 */
	private function enqueue_mediaelement_script() {
		$audio_library = apply_filters( 'wp_audio_shortcode_library', 'mediaelement' );
		$video_library = apply_filters( 'wp_video_shortcode_library', 'mediaelement' );

		if ( ! in_array( 'mediaelement', array( $audio_library, $video_library ) ) ) {
			return;
		}

		wp_enqueue_style( 'wp-mediaelement' );
		wp_enqueue_script( 'wp-mediaelement' );
	}
}

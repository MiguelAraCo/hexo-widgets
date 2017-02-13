"use strict";

const deAsync = require( "deasync" );
const jsDOM = require( "jsdom" );
const ejs = require( "ejs" );
const glob = require( "glob" );
const path = require( "path" );
const fs = require( "fs" );

hexo.extend.helper.register( "render_widgets", ( html, page ) => {
	let result = {
		html: "",
		error: null
	};

	jsDOM.env( {
		html: html,
		done: function( error, window ) {
			if( error ) {
				result.error = error;
				return;
			}

			processDOM( window, page ).then( () => {
				result.html = window.document.querySelector( "html" ).outerHTML;
			} ).catch( ( error ) => {
				result.error = error;
				console.error( error );
			} );
		}
	} );

	// Hexo doesn't support asynchronous helpers so we need to convert the asynchronous action to a synchronous
	deAsync.loopWhile( () => ! result.html && ! result.error );

	return "<!DOCTYPE html>" + result.html;
} );

function processDOM( window, page ) {
	const document = window.document;
	const $ = document.querySelector.bind( document );
	const $$ = document.querySelectorAll.bind( document );

	const _ = {
		$: $,
		$$: $$
	};

	let widgets = glob.sync( hexo.theme.base + "widgets/*.widget.js" ).map( ( file ) => {
		return require( path.resolve( file ) );
	} );

	let widgetPromises = [];

	for( let widget of widgets ) {
		let elements = $$( widget.selector );

		for( let i = 0; i < elements.length; ++ i ) {
			let element = elements[ i ];

			let data = {};

			let widgetPromise = preRender( widget, data, element, page, document, _ ).then( () => {
				if( "template" in widget || "templateURL" in widget ) return renderWidgetWithTemplate( widget, data, element, page, document, _ );
				else if( "render" in widget ) return renderWidget( widget, data, element, page, document, _ );
				else return Promise.resolve();
			} );

			widgetPromises.push( widgetPromise );
		}

		if( elements.length > 0 ) widgetPromises.push( addWidgetAssets( widget, page, document, _ ) );
	}

	removeAssetPlaceholders( document, _ );

	return Promise.all( widgetPromises );
}

function preRender( widget, data, element, page, document, _ ) {
	return "preRender" in widget ? widget.preRender( widget, data, element, page, document, _ ) : Promise.resolve();
}

function renderWidgetWithTemplate( widget, data, element, page, document, _ ) {
	// TODO: Use readFile instead of readFileSync
	// TODO: Reject the promise if there is no template or templateURL defined
	// TODO: Allow templateURL outside of the base (or even local to the widget file)
	let template = "template" in widget ? widget.template : "templateURL" in widget ? fs.readFileSync( hexo.theme.base + "widgets/" + widget.templateURL ).toString() : "";

	element.outerHTML = ejs.render( template, data );

	return Promise.resolve();
}

function renderWidget( widget, data, element, page, document, _ ) {
	return widget.render( widget, data, element, page, document, _ );
}

function addWidgetAssets( widget, page, document, _ ) {
	let promises = [];

	if( "styles" in widget && widget.styles.length !== 0 ) promises.push( addWidgetStyles( widget, page, document, _ ) );
	if( "scripts" in widget && widget.scripts.length !== 0 ) promises.push( addWidgetScripts( widget, page, document, _ ) );

	return Promise.all( promises );
}

function addWidgetStyles( widget, page, document, _ ) {
	let styles = widget.styles;

	let promises = [];
	for( let style of styles ) {
		promises.push( addWidgetStyle( style, widget, page, document, _ ) );
	}

	return Promise.all( promises );
}

function addWidgetStyle( style, widget, page, document, _ ) {
	if( ( "inline" in style && style.inline ) || "source" in style ) {
		let styleSource = "";

		if( "file" in style ) {
			styleSource = fs.readFileSync( style.file ).toString();
		} else if( "source" in style ) {
			styleSource = style.source;
		}

		let styleNode = document.createElement( "style" );
		styleNode.innerHTML = styleSource;

		let $widgetsStyles = _.$( "#widgets-styles" );
		$widgetsStyles.parentNode.insertBefore( styleNode, $widgetsStyles );
	} else {
		// TODO
	}
}

function addWidgetScripts( widget, page, document, _ ) {
	return Promise.resolve().then( () => {
		let promises = [];
		for( let script of widget.scripts ) {
			promises.push( addWidgetScript( script, widget, page, document, _ ) );
		}
		return Promise.all( promises );
	});
}

function addWidgetScript( script, widget, page, document, _ ) {
	return Promise.resolve().then(() => {
		if( ( "inline" in script && script.inline ) || "source" in script || "sourceURL" in script ) {
			let source = "";
			if( "source" in script ) {
				source = script.source;
			} else if( "sourceURL" in script ) {
				source = fs.readFileSync( script.sourceURL ).toString();
			}

			source = `(function( window ){ ${source} })( window );`;

			let scriptElement = document.createElement( "script" );
			scriptElement.innerHTML = source;

			let $widgetsScripts = _.$( "#widgets-scripts" );
			$widgetsScripts.parentNode.insertBefore( scriptElement, $widgetsScripts );
		} else {
			// TODO
		}
	});
}

function removeAssetPlaceholders( document, _ ) {
	let $stylesPlaceholder = _.$( "#widgets-styles" );
	if( $stylesPlaceholder ) $stylesPlaceholder.remove();

	let $scriptsPlaceholder = _.$( "#widgets-scripts" );
	if( $scriptsPlaceholder ) $scriptsPlaceholder.remove();
}
"use strict";

const deAsync = require( "deasync" );
const jsDOM = require( "jsdom" );
const ejs = require( "ejs" );
const glob = require( "glob" );
const path = require( "path" );
const fs = require( "fs" );

hexo.extend.helper.register( "render_widgets", ( html, sidebarEnabled ) => {
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

			processDOM( window, sidebarEnabled ).then( () => {
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

function processDOM( window ) {
	const document = window.document;
	const $ = document.querySelector.bind( document );
	const $$ = document.querySelectorAll.bind( document );

	const _ = {
		$: $,
		$$: $$
	};

	let widgets = glob.sync( hexo.theme.base + "widgets/*.js" ).map( ( file ) => {
		return require( path.resolve( file ) );
	} );

	let widgetPromises = [];

	for( let widget of widgets ) {
		let elements = $$( widget.selector );

		for( let i = 0; i < elements.length; ++ i ) {
			let element = elements[ i ];

			let data = {};

			let widgetPromise = preRender( element, widget, data, document, _ ).then( () => {
				if( "template" in widget || "templateURL" in widget ) return renderWidgetWithTemplate( widget, data, element, document, _ );
				else if( "render" in widget ) return renderWidget( widget, data, element, document, _ );
				else return Promise.resolve();
			} );

			widgetPromises.push( widgetPromise );
		}

		if( elements.length > 0 ) widgetPromises.push( addWidgetAssets( widget, document, _ ) );
	}

	removeAssetPlaceholders( document, _ );

	return Promise.all( widgetPromises );
}

function preRender( widget, data, element, document, _ ) {
	return "preRender" in widget ? widget.preRender( widget, data, element, document, _ ) : Promise.resolve();
}

function renderWidgetWithTemplate( widget, data, element, document, _ ) {
	// TODO: Use readFile instead of readFileSync
	// TODO: Reject the promise if there is no template or templateURL defined
	// TODO: Allow templateURL outside of the base (or even local to the widget file)
	let template = "template" in widget ? widget.template : "templateURL" in widget ? fs.readFileSync( hexo.theme.base + "widgets/" + widget.templateURL ).toString() : "";

	element.outerHTML = ejs.render( template, data );

	return Promise.resolve();
}

function renderWidget( widget, data, element, document, _ ) {
	return widget.render( widget, data, element, document, _ );
}

function addWidgetAssets( widget, document, _ ) {
	let promises = [];

	if( "styles" in widget ) promises.push( addWidgetStyles( widget, document, _ ) );
	if( "scripts" in widget ) promises.push( addWidgetScripts( widget, document, _ ) );

	return Promise.all( promises );
}

function addWidgetStyles( widget, document, _ ) {
	let styles = widget.styles;

	let promises = [];
	for( let style of styles ) {
		promises.push( addWidgetStyle( style, widget, document, _ ) );
	}

	return Promise.all( promises );
}

function addWidgetStyle( style, widget, document, _ ) {
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

function addWidgetScripts( widget, document, _ ) {
	// TODO
	return Promise.resolve();
}

function removeAssetPlaceholders( document, _ ) {
	let $stylesPlaceholder = _.$( "#widgets-styles" );
	if( $stylesPlaceholder ) $stylesPlaceholder.remove();

	let $scriptsPlaceholder = _.$( "#widgets-scripts" );
	if( $scriptsPlaceholder ) $scriptsPlaceholder.remove();
}
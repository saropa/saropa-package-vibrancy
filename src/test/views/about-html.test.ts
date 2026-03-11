import * as assert from 'assert';
import { buildAboutHtml } from '../../views/about-html';

describe('buildAboutHtml', () => {
    it('should return valid HTML with doctype', () => {
        const html = buildAboutHtml('1.2.3');
        assert.ok(html.startsWith('<!DOCTYPE html>'));
        assert.ok(html.includes('</html>'));
    });

    it('should display the version', () => {
        const html = buildAboutHtml('0.1.1');
        assert.ok(html.includes('v0.1.1'));
    });

    it('should include marketplace link', () => {
        const html = buildAboutHtml('1.0.0');
        assert.ok(html.includes(
            'marketplace.visualstudio.com/items?itemName=saropa.saropa-package-vibrancy',
        ));
    });

    it('should include GitHub link', () => {
        const html = buildAboutHtml('1.0.0');
        assert.ok(html.includes(
            'github.com/saropa/saropa-package-vibrancy',
        ));
    });

    it('should include CSP meta tag', () => {
        const html = buildAboutHtml('1.0.0');
        assert.ok(html.includes('Content-Security-Policy'));
    });

    it('should include extension name', () => {
        const html = buildAboutHtml('1.0.0');
        assert.ok(html.includes('Saropa Package Vibrancy'));
    });
});

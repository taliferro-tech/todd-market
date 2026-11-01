import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/** Focuses the element when it appears (inputs shown on demand; the autofocus attribute only works on page load). */
@Directive( { selector: '[tmAutofocus]', standalone: true } )
export class AutofocusDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLElement>>( ElementRef );

  ngAfterViewInit (): void {
    this.el.nativeElement.focus();
  }
}

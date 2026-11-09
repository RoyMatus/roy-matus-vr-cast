/* Read only SPS dimensions, with bounded bit/Golomb reads. ES5 / Node 0.10. */
'use strict';
module.exports=function(nal){
 var bytes=[],i,zeros=0;
 if((nal[0]&31)!==7)throw Error('Expected H.264 SPS');
 for(i=1;i<nal.length;i++){var v=nal[i];if(zeros===2&&v===3){zeros=0;continue;}bytes.push(v);zeros=v===0?zeros+1:0;}
 var pos=0;
 function bits(n){if(n<0||n>32||pos+n>bytes.length*8)throw Error('Truncated H.264 SPS');var v=0;while(n--){v=v*2+((bytes[pos>>>3]>>>(7-(pos&7)))&1);pos++;}return v;}
 function ue(){var n=0;while(!bits(1)){if(++n>24)throw Error('Oversized H.264 SPS value');}return Math.pow(2,n)-1+bits(n);}
 function se(){var v=ue();return v%2?(v+1)/2:-v/2;}
 var profile=bits(8);bits(16);ue();var chroma=1,separate=0;
 if([100,110,122,244,44,83,86,118,128,138,139,134,135].indexOf(profile)>=0){
  chroma=ue();if(chroma>3)throw Error('Invalid H.264 chroma format');if(chroma===3)separate=bits(1);
  ue();ue();bits(1);
  if(bits(1))for(i=0;i<(chroma===3?12:8);i++)if(bits(1)){
   var last=8,next=8;for(var j=0;j<(i<6?16:64);j++){if(next)next=(last+se()+256)%256;if(next)last=next;}
  }
 }
 ue();var order=ue();if(order===0)ue();else if(order===1){bits(1);se();se();var cycles=ue();if(cycles>256)throw Error('Invalid H.264 order cycle');for(i=0;i<cycles;i++)se();}else if(order!==2)throw Error('Invalid H.264 picture order');
 ue();bits(1);var width=(ue()+1)*16,height=(ue()+1)*16,frame=bits(1);height*=2-frame;if(!frame)bits(1);bits(1);
 var left=0,right=0,top=0,bottom=0;if(bits(1)){left=ue();right=ue();top=ue();bottom=ue();}
 var format=separate?0:chroma,unitX=format===1||format===2?2:1,unitY=(format===1?2:1)*(2-frame);
 width-=(left+right)*unitX;height-=(top+bottom)*unitY;
 if(width<=0||height<=0||width>1920||height>1080)throw Error('Video exceeds the Full HD TV limit');
 return {width:width,height:height};
};
